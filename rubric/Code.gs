/**
 * Backend for the Studio Rubric goal-setting form (../index.html).
 *
 * Setup:
 *   1. Create a Google Sheet, then Extensions > Apps Script, and paste this whole file in as Code.gs.
 *   2. Run `runMeOnceToAuthorize` once from the Apps Script editor and approve the permissions.
 *      NOTE: if you restricted this project's OAuth scopes to just
 *      spreadsheets.currentonly (see the setup conversation), you must also add
 *      "https://www.googleapis.com/auth/script.send_mail" to the oauthScopes
 *      array in appsscript.json before MailApp.sendEmail will work, then
 *      re-run this and re-authorize.
 *   3. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy.
 *   4. Copy the Web App URL into SCRIPT_URL at the top of index.html's <script>.
 *   5. Update RESUME_BASE_URL below if the page isn't served from the default URL.
 *   6. Whenever you edit this file, use Manage deployments > edit (pencil) > Version: New > Deploy,
 *      otherwise the live URL keeps serving the old code.
 *
 * Keep CATEGORY_STRUCTURE in sync with the SECTIONS array in index.html — this is the single
 * source of truth for row order, section titles, and percent targets on the backend side.
 */

var RAW_SHEET_NAME = "Raw Data";
var DRAFTS_SHEET_NAME = "Drafts";
var RESUME_BASE_URL = "https://nkohen.github.io/rubric/";

// Resume links are only emailed to addresses ending in this domain. Anyone
// reading this file directly can see it, but it's not surfaced anywhere in
// the page's visible text.
var ALLOWED_EMAIL_DOMAIN = "@luther.edu";

// Hard caps on stored text, mainly so a spam/abuse attempt can't blow up
// sheet cells or eat through Apps Script quota. Keep in sync with the
// MAX_* constants in index.html.
var MAX_NAME_LENGTH = 200;
var MAX_EMAIL_LENGTH = 254;
var MAX_SHORT_TEXT_LENGTH = 300;   // "Other" meaning
var MAX_LONG_TEXT_LENGTH = 4000;   // grade descriptions, feedback

var CATEGORY_STRUCTURE = [
  {
    title: "Lessons", target: 70,
    headerColor: "#333333", subColor: "#e6e6e6",
    rows: ["Scales", "Etudes", "Solos", "Excerpts", "Collab Piano", "Playing with Metronome", "Sight Reading", "Other"],
  },
  {
    title: "Reflection", target: 10,
    headerColor: "#3c78d8", subColor: "#cfe2f3",
    rows: ["Practice logs", "Implementing Performance Feedback", "Other"],
  },
  {
    title: "Seminar", target: 10,
    headerColor: "#34a853", subColor: "#d9ead3",
    rows: ["Giving Feedback", "Seminar Performance", "Clarinet Choir", "Other"],
  },
  {
    title: "Semester Project", target: 10,
    headerColor: "#e69138", subColor: "#fce5cd",
    rows: ["Performances", "Competitions", "Juries", "Non-performance projects", "Other"],
  },
];

var GRADES = ["A", "C", "F"];
var TABLE_HEADER = ["Category", "Percent"].concat(GRADES);

function runMeOnceToAuthorize() {
  SpreadsheetApp.getActiveSpreadsheet();
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "loadDraft" && e.parameter.token) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrCreateDraftsSheet(ss);
    var row = findDraftRowByToken(sheet, e.parameter.token);
    if (!row) return jsonOutput({ ok: false, error: "Draft not found" });
    var values = sheet.getRange(row, 1, 1, 5).getValues()[0];
    return jsonOutput({ ok: true, email: values[0], draft: JSON.parse(values[4]) });
  }
  return ContentService.createTextOutput("Rubric backend is running.");
}

function doPost(e) {
  var response;
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "submit";
    if (action === "saveDraft") {
      response = handleSaveDraft(payload, true);
    } else if (action === "autosaveDraft") {
      response = handleSaveDraft(payload, false);
    } else {
      response = handleSubmit(payload);
    }
  } catch (err) {
    response = { ok: false, error: err.message };
  }
  return jsonOutput(response);
}

function truncate(str, max) {
  str = (str === null || str === undefined) ? "" : String(str);
  return str.length > max ? str.substring(0, max) : str;
}

// Rebuilds a rubric-content object from whatever the client sent, applying
// length caps and dropping any unexpected fields along the way.
function sanitizeDraftContent(payload) {
  payload = payload || {};
  return {
    studentName: truncate(payload.studentName, MAX_NAME_LENGTH),
    feedback: truncate(payload.feedback, MAX_LONG_TEXT_LENGTH),
    categories: (payload.categories || []).map(function (c) {
      c = c || {};
      var descs = c.descriptions || {};
      return {
        section: truncate(c.section, MAX_NAME_LENGTH),
        name: truncate(c.name, MAX_NAME_LENGTH),
        percent: Number(c.percent) || 0,
        descriptions: {
          A: truncate(descs.A, MAX_LONG_TEXT_LENGTH),
          C: truncate(descs.C, MAX_LONG_TEXT_LENGTH),
          F: truncate(descs.F, MAX_LONG_TEXT_LENGTH),
        },
        otherMeaning: c.otherMeaning ? truncate(c.otherMeaning, MAX_SHORT_TEXT_LENGTH) : null,
      };
    }),
  };
}

function handleSubmit(payload) {
  if (!payload.studentName || !Array.isArray(payload.categories)) {
    throw new Error("Malformed payload: expected studentName and categories[]");
  }
  var clean = sanitizeDraftContent(payload);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timestamp = new Date();
  appendRawRow(ss, timestamp, clean);
  var sheetName = renderRubricSheet(ss, timestamp, clean);
  if (payload.draftToken) deleteDraftByToken(ss, payload.draftToken);
  return { ok: true, sheet: sheetName };
}

function handleSaveDraft(payload, sendEmail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateDraftsSheet(ss);
  var clean = sanitizeDraftContent(payload.draft);
  var timestamp = new Date();
  var dataJson = JSON.stringify(clean);

  if (sendEmail) {
    var email = truncate(payload.email, MAX_EMAIL_LENGTH).trim();
    if (!email || !email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN.toLowerCase())) {
      return { ok: false, error: "That email address can't be used to save progress." };
    }

    // One draft slot per email — reuse the existing row/token if there is one.
    var existingRow = findDraftRowByEmail(sheet, email);
    var token = existingRow ? sheet.getRange(existingRow, 3).getValue() : Utilities.getUuid();
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, 5).setValues([[email, clean.studentName, token, timestamp, dataJson]]);
    } else {
      sheet.appendRow([email, clean.studentName, token, timestamp, dataJson]);
    }
    sendResumeEmail(email, token);
    return { ok: true, token: token };
  }

  var token = (payload.token || "").toString();
  if (!token) throw new Error("Missing token for autosave");
  var row = findDraftRowByToken(sheet, token);
  if (!row) throw new Error("Draft not found");
  sheet.getRange(row, 2).setValue(clean.studentName);
  sheet.getRange(row, 4).setValue(timestamp);
  sheet.getRange(row, 5).setValue(dataJson);
  return { ok: true };
}

function sendResumeEmail(email, token) {
  var url = RESUME_BASE_URL + "?draft=" + encodeURIComponent(token);
  MailApp.sendEmail({
    to: email,
    subject: "Resume your studio rubric",
    body: "Here's your link to resume filling out your studio rubric:\n\n" + url +
      "\n\nYou can use this any time before you submit.",
  });
}

function getOrCreateDraftsSheet(ss) {
  var sheet = ss.getSheetByName(DRAFTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DRAFTS_SHEET_NAME);
    sheet.appendRow(["Email", "Student Name", "Token", "Last Saved", "Data (JSON)"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findDraftRowByEmail(sheet, email) {
  var values = sheet.getDataRange().getValues();
  var target = email.toLowerCase();
  for (var i = 1; i < values.length; i++) {
    if ((values[i][0] || "").toString().trim().toLowerCase() === target) return i + 1;
  }
  return null;
}

function findDraftRowByToken(sheet, token) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if ((values[i][2] || "").toString() === token) return i + 1;
  }
  return null;
}

function deleteDraftByToken(ss, token) {
  var sheet = ss.getSheetByName(DRAFTS_SHEET_NAME);
  if (!sheet) return;
  var row = findDraftRowByToken(sheet, token);
  if (row) sheet.deleteRow(row);
}

function appendRawRow(ss, timestamp, payload) {
  var sheet = ss.getSheetByName(RAW_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RAW_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Student Name", "Feedback", "Data (JSON)"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([timestamp, payload.studentName, payload.feedback || "", JSON.stringify(payload)]);
}

function findCategory(payload, sectionTitle, rowName) {
  for (var i = 0; i < payload.categories.length; i++) {
    var c = payload.categories[i];
    if (c.section === sectionTitle && c.name === rowName) return c;
  }
  return null;
}

function uniqueSheetName(ss, baseName) {
  var name = baseName;
  var n = 2;
  while (ss.getSheetByName(name)) {
    name = baseName + " (" + n + ")";
    n++;
  }
  return name;
}

function renderRubricSheet(ss, timestamp, payload) {
  var dateStr = Utilities.formatDate(timestamp, ss.getSpreadsheetTimeZone() || "UTC", "yyyy-MM-dd HH:mm");
  var baseName = payload.studentName + " - " + dateStr;
  var sheetName = uniqueSheetName(ss, baseName);
  var sheet = ss.insertSheet(sheetName);

  var numCols = TABLE_HEADER.length;
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 70);
  for (var c = 3; c <= numCols; c++) sheet.setColumnWidth(c, 230);

  var row = 1;
  sheet.getRange(row, 1, 1, numCols).setValues([TABLE_HEADER])
    .setBackground("#1b5e20").setFontColor("#ffffff").setFontWeight("bold");
  row++;

  CATEGORY_STRUCTURE.forEach(function (section) {
    sheet.getRange(row, 1, 1, numCols).merge()
      .setValue(section.title + " (" + section.target + "%)")
      .setBackground(section.headerColor).setFontColor("#ffffff").setFontWeight("bold");
    row++;

    section.rows.forEach(function (rowName) {
      var cat = findCategory(payload, section.title, rowName);
      var label = rowName;
      if (rowName === "Other" && cat && cat.otherMeaning) {
        label = "Other — " + cat.otherMeaning;
      }
      var percent = cat ? cat.percent : 0;
      var descs = cat ? cat.descriptions : {};
      var gradeValues = GRADES.map(function (g) { return descs[g] || ""; });
      var values = [label, percent].concat(gradeValues);

      sheet.getRange(row, 1, 1, numCols).setValues([values])
        .setBackground(section.subColor)
        .setWrap(true)
        .setVerticalAlignment("top");
      sheet.setRowHeight(row, 90);
      row++;
    });
  });

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  return sheetName;
}

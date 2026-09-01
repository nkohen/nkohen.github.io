/**
 * Backend for the Studio Rubric goal-setting form (../index.html) AND the
 * teacher gradebook desktop app (see ~/dev/anoushka-gradebook).
 *
 * Setup — public rubric form:
 *   1. Create a Google Sheet, then Extensions > Apps Script, and paste this whole file in as Code.gs.
 *   2. Run `runMeOnceToAuthorize` once from the Apps Script editor and approve the permissions.
 *      NOTE: if you restricted this project's OAuth scopes to just
 *      spreadsheets.currentonly, you must widen them for the gradebook actions below
 *      to work at all (see "Setup — gradebook app" step 1), then re-run this and re-authorize.
 *   3. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy.
 *   4. Copy the Web App URL into SCRIPT_URL at the top of index.html's <script>.
 *   5. Update RESUME_BASE_URL below if the page isn't served from the default URL.
 *   6. Whenever you edit this file, use Manage deployments > edit (pencil) > Version: New > Deploy,
 *      otherwise the live URL keeps serving the old code.
 *
 * Setup — gradebook app (adds the actions the desktop app calls):
 *   1. In this project's appsscript.json (Project Settings > "Show appsscript.json manifest
 *      file in editor"), make sure oauthScopes includes at least:
 *        "https://www.googleapis.com/auth/spreadsheets"   (NOT spreadsheets.currentonly —
 *          the gradebook actions open OTHER spreadsheets by ID, not just this bound one)
 *        "https://www.googleapis.com/auth/drive.file"     (create/copy/share files — every
 *          file this script ever touches, template + all per-student sheets, is one it
 *          created itself, so the narrower drive.file scope is enough; no need for full drive)
 *        "https://www.googleapis.com/auth/script.send_mail"
 *      Re-run `runMeOnceToAuthorize` and re-approve after changing scopes.
 *   2. Run `buildTemplateSpreadsheet` once from the Apps Script editor. It creates a new
 *      "Gradebook Template" spreadsheet (Gradebook tab, then Rubrics tab, fully wired with
 *      the same formulas described in ~/dev/anoushka-gradebook/docs/DESIGN.md) and logs its
 *      ID/URL — View > Logs (or Executions) to find it.
 *   3. In Project Settings > Script Properties, set:
 *        TEMPLATE_SPREADSHEET_ID = <the id logged in step 2>
 *        GRADEBOOK_SECRET        = <a long random string — this is the only thing that
 *          gates every gradebook action below; generate with e.g. `openssl rand -hex 32`>
 *      The desktop app's Settings screen needs this same URL + secret.
 *   4. New deployment version (see step 6 above) so the new actions are actually live.
 *
 * Keep CATEGORY_STRUCTURE in sync with the SECTIONS array in index.html — this is the single
 * source of truth for row order, section titles, and percent targets, AND (as of the
 * gradebook actions below) the fixed 24-row layout of the Gradebook/Rubrics tabs.
 */

var RAW_SHEET_NAME = "Raw Data";
var DRAFTS_SHEET_NAME = "Drafts";
var ROSTER_SHEET_NAME = "Roster";
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

// Gradebook/Rubrics tab layout (see docs/DESIGN.md in anoushka-gradebook for how these
// were derived from the actual prototype workbook). Every action below that reads or
// writes a student's Gradebook/Rubrics tab goes through flattenCategoryStructure() so
// there's exactly one place that knows the row order.
var DEFAULT_TEMPLATE_WEEKS = 15;
var GRADEBOOK_SHEET_NAME = "Gradebook";
var RUBRICS_SHEET_NAME = "Rubrics";

// Cosmetic-only palette for the Gradebook/Rubrics template (buildGradebookTemplate,
// buildRubricsTemplate below) — matches the desktop app's own accent (#1b5e20 in
// src/styles.css) for brand consistency. Purely Range formatting (background/font/
// border); never touches row/column position or formulas.
var TEMPLATE_STYLE = {
  headerBg: "#1b5e20",
  headerFg: "#f6faf4",
  sectionBg: "#e3efe2",
  sectionFg: "#14401a",
  bandBg: "#f2f7f0",
  gridColor: "#cfe0cc",
};

var SYSTEM_SHEET_NAMES = [RAW_SHEET_NAME, DRAFTS_SHEET_NAME, ROSTER_SHEET_NAME, GRADEBOOK_SHEET_NAME, RUBRICS_SHEET_NAME];

// Actions that require a valid GRADEBOOK_SECRET before doPost dispatches them at all.
var GATED_ACTIONS = [
  "listSubmissions", "listRoster", "createStudentSheet",
  "refreshRubrics", "readGrades", "writeGrades",
];

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
    var values = sheet.getRange(row, 1, 1, 6).getValues()[0];
    return jsonOutput({ ok: true, email: values[0], draft: JSON.parse(values[4]), submitted: !!values[5] });
  }
  return ContentService.createTextOutput("Rubric backend is running.");
}

function doPost(e) {
  var payload, action;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: "Malformed request" });
  }
  action = payload.action || "submit";

  var isGated = GATED_ACTIONS.indexOf(action) !== -1;
  if (isGated) {
    try {
      requireSecret(payload);
    } catch (err) {
      // Deliberately generic — never confirm/deny *why* a gated call failed.
      return jsonOutput({ ok: false, error: "Unauthorized" });
    }
  }

  var response;
  try {
    switch (action) {
      case "submit":
        response = handleSubmit(payload);
        break;
      case "saveDraft":
        response = handleSaveDraft(payload, true);
        break;
      case "autosaveDraft":
        response = handleSaveDraft(payload, false);
        break;
      case "listSubmissions":
        response = handleListSubmissions();
        break;
      case "listRoster":
        response = handleListRoster();
        break;
      case "createStudentSheet":
        response = handleCreateStudentSheet(payload);
        break;
      case "refreshRubrics":
        response = handleRefreshRubrics(payload);
        break;
      case "readGrades":
        response = handleReadGrades(payload);
        break;
      case "writeGrades":
        response = handleWriteGrades(payload);
        break;
      default:
        throw new Error("Unknown action: " + action);
    }
  } catch (err) {
    // The secret check above already passed by this point for gated actions,
    // so the caller is already inside the authenticated boundary — echoing
    // the real error message back doesn't leak anything an unauthenticated
    // caller could use (they'd have been rejected as "Unauthorized" already).
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
  // Keep (rather than delete) the draft row, so resuming this link later shows
  // exactly what was submitted — not whatever the last autosave happened to
  // catch — and the page can tell the student their submission was received.
  if (payload.draftToken) markDraftSubmitted(ss, payload.draftToken, clean, timestamp);
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
    sheet.appendRow(["Email", "Student Name", "Token", "Last Saved", "Data (JSON)", "Submitted"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
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

function markDraftSubmitted(ss, token, clean, timestamp) {
  var sheet = getOrCreateDraftsSheet(ss);
  var row = findDraftRowByToken(sheet, token);
  if (!row) return; // e.g. the student submitted without ever saving a draft
  sheet.getRange(row, 2, 1, 4).setValues([[clean.studentName, token, timestamp, JSON.stringify(clean)]]);
  sheet.getRange(row, 6).setValue(timestamp);
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
    // No merged cells here on purpose — Google Sheets "Table" objects refuse
    // to accept a paste containing any merged cell at all ("You can't paste
    // merged cells into a table"), and this output is meant to be copied into
    // one. Instead, every cell in the row gets the same background/font
    // color with the label only in column 1 — Sheets lets the text visually
    // overflow into the empty, identically-colored cells to its right, which
    // reads as one continuous bar without an actual merge.
    var headerRowRange = sheet.getRange(row, 1, 1, numCols);
    var headerRowValues = [section.title + " (" + section.target + "%)"];
    for (var i = 1; i < numCols; i++) headerRowValues.push("");
    headerRowRange.setValues([headerRowValues]);
    headerRowRange.setBackground(section.headerColor).setFontColor("#ffffff").setFontWeight("bold");
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

// ---------------------------------------------------------------------------
// Gradebook app support (secret-gated). Everything below this point is new.
// ---------------------------------------------------------------------------

function requireSecret(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty("GRADEBOOK_SECRET");
  if (!expected) throw new Error("Server not configured: missing GRADEBOOK_SECRET script property");
  var provided = (payload && payload.secret) || "";
  if (!timingSafeEquals(String(provided), expected)) throw new Error("Unauthorized");
}

// Avoids leaking how many leading characters of the secret matched via
// response-time differences. Overkill for this threat model, but free.
function timingSafeEquals(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getTemplateSpreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty("TEMPLATE_SPREADSHEET_ID");
  if (!id) throw new Error("Server not configured: missing TEMPLATE_SPREADSHEET_ID script property");
  return id;
}

// Single source of truth for "which row is which" across Rubrics and
// Gradebook. Both tabs list the same 4 section headers + their sub-items, in
// the same order as CATEGORY_STRUCTURE; Rubrics data starts at row 2,
// Gradebook data starts at row 7 — a fixed +5 offset, confirmed against the
// real prototype workbook (see docs/DESIGN.md in anoushka-gradebook).
function flattenCategoryStructure() {
  var rows = [];
  CATEGORY_STRUCTURE.forEach(function (section) {
    rows.push({ isHeader: true, section: section.title, name: section.title, target: section.target });
    section.rows.forEach(function (rowName) {
      rows.push({ isHeader: false, section: section.title, name: rowName });
    });
  });
  return rows;
}

function rubricsRowFor(flatIndex) { return flatIndex + 2; }
function gradebookRowFor(flatIndex) { return flatIndex + 7; }

function columnToLetter(col) {
  var letter = "";
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function getOrCreateRosterSheet(ss) {
  var sheet = ss.getSheetByName(ROSTER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ROSTER_SHEET_NAME);
    sheet.appendRow(["Student Name", "Email", "Source Submission Tab", "Spreadsheet ID", "Spreadsheet URL", "Status", "Created At"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Returns { row, values } for the matching Roster row (values = that row's
// 7 columns, already in hand — the caller needs both the index, to write
// back to later, and the data, to report on a stuck/existing row), or null.
// A single getDataRange().getValues() call whether or not there's a match,
// versus a second getRange().getValues() to re-fetch a row already read
// during the scan.
function findRosterRowByName(sheet, studentName) {
  var values = sheet.getDataRange().getValues();
  var target = studentName.trim().toLowerCase();
  for (var i = 1; i < values.length; i++) {
    if ((values[i][0] || "").toString().trim().toLowerCase() === target) return { row: i + 1, values: values[i] };
  }
  return null;
}

// Reads a raw submission tab (same layout renderRubricSheet writes: Category
// in col A, Percent in col B, grade text in C.. one column per GRADES entry)
// into a flat array parallel to flattenCategoryStructure().
function readSubmissionSheet(sheet) {
  var numDataRows = flattenCategoryStructure().length;
  var values = sheet.getRange(2, 1, numDataRows, TABLE_HEADER.length).getValues();
  return values.map(function (row) {
    return {
      label: row[0],
      percent: row[1],
      grades: GRADES.map(function (g, i) { return row[2 + i]; }),
    };
  });
}

// Writes submission data into a Rubrics tab's data cells only (percent +
// grade-level text, columns C..). Column B (category name) is never touched —
// it's baked into the template once and is what Gradebook's formulas key off.
function writeRubricsData(rubricsSheet, submissionData) {
  var values = submissionData.map(function (item) {
    return [item.percent].concat(item.grades);
  });
  rubricsSheet.getRange(2, 3, values.length, 1 + GRADES.length).setValues(values);
}

function sendStudentSheetEmail(email, studentName, url) {
  MailApp.sendEmail({
    to: email,
    subject: "Your gradebook is ready",
    body: "Hi " + studentName + ",\n\n" +
      "Your gradebook and rubric are now available here (view-only):\n\n" + url + "\n",
  });
}

// Caches whole JSON responses for the read-only gradebook actions, keyed by
// action name (+ spreadsheetId for readGrades). A hit skips
// SpreadsheetApp.openById() and the range reads entirely — see
// ~/dev/anoushka-gradebook/QUESTIONS.md #10: that non-bound openById() call
// is one of two structural, plausible causes of the app's general slowness,
// and this is the only place it can actually be skipped rather than just
// made faster. TTL is short (20s) since these are read-only, low-stakes-if-
// momentarily-stale values (per QUESTIONS.md #10), and every gated action
// that changes what one of these would return removes its entry immediately
// below rather than waiting out the TTL — see handleCreateStudentSheet,
// handleWriteGrades, handleRefreshRubrics.
var READ_CACHE_TTL_SECONDS = 20;

function getReadCache() {
  return CacheService.getScriptCache();
}

function cachedJsonResult(cacheKey, compute) {
  var cache = getReadCache();
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var result = compute();
  cache.put(cacheKey, JSON.stringify(result), READ_CACHE_TTL_SECONDS);
  return result;
}

function invalidateReadCache(cacheKey) {
  getReadCache().remove(cacheKey);
}

function readGradesCacheKey(spreadsheetId) {
  return "readGrades:" + spreadsheetId;
}

function handleListSubmissions() {
  return cachedJsonResult("listSubmissions", function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var submissions = ss.getSheets()
      .map(function (sheet) { return sheet.getName(); })
      .filter(function (name) { return SYSTEM_SHEET_NAMES.indexOf(name) === -1; })
      .sort();
    return { ok: true, submissions: submissions };
  });
}

function handleListRoster() {
  return cachedJsonResult("listRoster", function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrCreateRosterSheet(ss);
    var values = sheet.getDataRange().getValues();
    var roster = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!row[0]) continue;
      roster.push({
        studentName: row[0],
        email: row[1],
        sourceTabName: row[2],
        spreadsheetId: row[3],
        spreadsheetUrl: row[4],
        status: row[5],
        createdAt: row[6],
      });
    }
    return { ok: true, roster: roster };
  });
}

function handleCreateStudentSheet(payload) {
  var studentName = truncate(payload.studentName, MAX_NAME_LENGTH).trim();
  var studentEmail = truncate(payload.studentEmail, MAX_EMAIL_LENGTH).trim();
  var sourceTabName = String(payload.sourceTabName || "");
  if (!studentName || !studentEmail || !sourceTabName) {
    throw new Error("Missing studentName, studentEmail, or sourceTabName");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rosterSheet = getOrCreateRosterSheet(ss);
    var existingMatch = findRosterRowByName(rosterSheet, studentName);
    var existingRow = existingMatch ? existingMatch.row : null;
    if (existingMatch && !payload.force) {
      var existing = existingMatch.values;
      var existingStatus = existing[5];
      if (existingStatus !== "done") {
        // Don't silently treat a stuck row as success, and don't silently
        // retry/finish the share step ourselves — a failure here (bad email,
        // Drive quota, etc.) needs a human to look at it, not a guess at the
        // right recovery action. See QUESTIONS.md #4.
        throw new Error(
          "Roster row for '" + studentName + "' is stuck at status '" + existingStatus +
          "' (spreadsheetId: " + existing[3] + ", spreadsheetUrl: " + existing[4] + "). " +
          "A previous createStudentSheet call didn't finish (likely failed during the " +
          "share/email step). Check that spreadsheet and the student's email, then either " +
          "fix and finish sharing it by hand and set its Roster status to \"done\", or call " +
          "again with force:true to provision a fresh copy (leaves the old file orphaned in Drive)."
        );
      }
      return { ok: true, alreadyExists: true, spreadsheetId: existing[3], spreadsheetUrl: existing[4], status: existing[5] };
    }

    var sourceSheet = ss.getSheetByName(sourceTabName);
    if (!sourceSheet) throw new Error("Submission tab not found: " + sourceTabName);
    var submissionData = readSubmissionSheet(sourceSheet);

    var templateId = getTemplateSpreadsheetId();
    var newFile = DriveApp.getFileById(templateId).makeCopy(studentName + " - Gradebook");
    var newId = newFile.getId();
    var newUrl = newFile.getUrl();

    // Write the Roster row (status "pending") before the share step, so a
    // failure partway through (e.g. a bad email on addViewer) still leaves a
    // findable, retryable record instead of an orphaned, untracked file.
    var rowIndex = existingRow || (rosterSheet.getLastRow() + 1);
    rosterSheet.getRange(rowIndex, 1, 1, 7).setValues([[
      studentName, studentEmail, sourceTabName, newId, newUrl, "pending", new Date(),
    ]]);
    SpreadsheetApp.flush();

    var newSs = SpreadsheetApp.openById(newId);
    var rubricsSheet = newSs.getSheetByName(RUBRICS_SHEET_NAME);
    if (!rubricsSheet) throw new Error("Template is missing its Rubrics tab");
    writeRubricsData(rubricsSheet, submissionData);

    DriveApp.getFileById(newId).addViewer(studentEmail);
    sendStudentSheetEmail(studentEmail, studentName, newUrl);

    rosterSheet.getRange(rowIndex, 6).setValue("done");
    invalidateReadCache("listRoster");

    return { ok: true, alreadyExists: false, spreadsheetId: newId, spreadsheetUrl: newUrl };
  } finally {
    lock.releaseLock();
  }
}

function handleRefreshRubrics(payload) {
  var spreadsheetId = String(payload.spreadsheetId || "");
  var sourceTabName = String(payload.sourceTabName || "");
  if (!spreadsheetId || !sourceTabName) throw new Error("Missing spreadsheetId or sourceTabName");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName(sourceTabName);
  if (!sourceSheet) throw new Error("Submission tab not found: " + sourceTabName);
  var submissionData = readSubmissionSheet(sourceSheet);

  var targetSs = SpreadsheetApp.openById(spreadsheetId);
  var rubricsSheet = targetSs.getSheetByName(RUBRICS_SHEET_NAME);
  if (!rubricsSheet) throw new Error("Target spreadsheet has no Rubrics tab");
  writeRubricsData(rubricsSheet, submissionData);
  // Gradebook's Weight column is a live formula off Rubrics!C<row>, so a
  // rubric refresh changes what a cached readGrades would return too.
  invalidateReadCache(readGradesCacheKey(spreadsheetId));
  return { ok: true };
}

function handleReadGrades(payload) {
  var spreadsheetId = String(payload.spreadsheetId || "");
  if (!spreadsheetId) throw new Error("Missing spreadsheetId");

  return cachedJsonResult(readGradesCacheKey(spreadsheetId), function () {
    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(GRADEBOOK_SHEET_NAME);
    if (!sheet) throw new Error("Target spreadsheet has no Gradebook tab");

    var lastCol = sheet.getLastColumn();
    var numDataRows = flattenCategoryStructure().length;
    // One bounding-rectangle read (row 2 through the last data row) instead
    // of three separate getValues()/getValue() calls — each is its own
    // round trip to the Sheets backend, and this is the one place in
    // readGrades that can be collapsed without changing what's read.
    var block = sheet.getRange(2, 1, numDataRows + 5, lastCol).getValues();
    var currentGrade = block[0][2];
    var headerRow = block[4];
    var dataRows = block.slice(5);

    // Only trust columns that actually look like "Week N" — a stray value
    // anywhere past column C on this tab shouldn't turn into a phantom,
    // silently-uncounted week column client-side.
    var rawWeeks = headerRow.slice(3);
    var weekIndices = [];
    rawWeeks.forEach(function (h, i) {
      if (/^Week \d+$/.test(String(h))) weekIndices.push(i);
    });
    var weekHeaders = weekIndices.map(function (i) { return rawWeeks[i]; });

    return {
      ok: true,
      currentGrade: currentGrade,
      weekHeaders: weekHeaders,
      rows: dataRows.map(function (r, i) {
        var allWeeks = r.slice(3);
        var weeks = weekIndices.map(function (wi) { return allWeeks[wi]; });
        return { row: 7 + i, category: r[0], weight: r[1], categoryGrade: r[2], weeks: weeks };
      }),
    };
  });
}

function handleWriteGrades(payload) {
  var spreadsheetId = String(payload.spreadsheetId || "");
  var scores = Array.isArray(payload.scores) ? payload.scores : [];
  if (!spreadsheetId) throw new Error("Missing spreadsheetId");

  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(GRADEBOOK_SHEET_NAME);
  if (!sheet) throw new Error("Target spreadsheet has no Gradebook tab");

  var maxWeeks = sheet.getLastColumn() - 3; // derived from the sheet, not hardcoded — see DESIGN.md

  // weekNumber is the fallback week for old-style (single-week form) calls,
  // where every score omits its own `week`. Keep validating it up front even
  // with an empty scores array, so a bad top-level weekNumber still fails
  // loudly rather than silently changing behavior based on payload shape.
  if (payload.weekNumber != null) {
    var topWeek = Number(payload.weekNumber);
    if (!(topWeek >= 1 && topWeek <= maxWeeks)) throw new Error("Invalid weekNumber");
  }

  var flat = flattenCategoryStructure();
  // Validate every entry before writing any — a single bad cell must abort
  // the whole call with nothing written, not partially commit a big batch.
  var updates = scores.map(function (s) {
    var row = Number(s.row);
    var week = s.week != null ? Number(s.week) : Number(payload.weekNumber);
    if (!(Number.isInteger(week) && week >= 1 && week <= maxWeeks)) throw new Error("Invalid week for row " + s.row);
    var flatIndex = row - 7;
    var entry = flat[flatIndex];
    // Header rows are structural (blank Weight in Rubrics), so writing a
    // grade there would silently do nothing useful — reject it outright
    // rather than let a client bug write into a row that can't count.
    if (!entry || entry.isHeader) throw new Error("Invalid row: " + s.row);
    var clearing = s.value === null;
    var value = clearing ? null : Number(s.value);
    if (!clearing && !(value >= 0 && value <= 100)) throw new Error("Invalid value for row " + s.row);
    return { row: row, col: 3 + week, value: value };
  });

  if (updates.length === 0) return { ok: true, updated: 0 };

  // Batch as one read + one write over the bounding rectangle of every
  // touched cell, instead of one setValue() per cell — a full-table save can
  // touch hundreds of cells across many weeks, and per-cell setValue() in a
  // loop risks the 6-minute execution limit and a half-written sheet on a
  // mid-loop failure.
  var minRow = updates[0].row, maxRow = updates[0].row;
  var minCol = updates[0].col, maxCol = updates[0].col;
  updates.forEach(function (u) {
    if (u.row < minRow) minRow = u.row;
    if (u.row > maxRow) maxRow = u.row;
    if (u.col < minCol) minCol = u.col;
    if (u.col > maxCol) maxCol = u.col;
  });

  var range = sheet.getRange(minRow, minCol, maxRow - minRow + 1, maxCol - minCol + 1);
  var values = range.getValues();
  updates.forEach(function (u) {
    values[u.row - minRow][u.col - minCol] = u.value === null ? "" : u.value;
  });
  range.setValues(values);
  invalidateReadCache(readGradesCacheKey(spreadsheetId));

  return { ok: true, updated: updates.length };
}

// One-time setup, run manually from the Apps Script editor (see the setup
// notes at the top of this file). Builds a standalone template spreadsheet —
// NOT a tab in this master sheet — because copying tabs individually into a
// new file breaks their cross-tab formula references (Rubrics!C<n> becomes
// #REF!); cloning the whole file with makeCopy() at provisioning time keeps
// everything intact instead. See docs/DESIGN.md in anoushka-gradebook.
function buildTemplateSpreadsheet() {
  var ss = SpreadsheetApp.create("Gradebook Template");
  var defaultSheet = ss.getSheets()[0];
  var gradebook = ss.insertSheet(GRADEBOOK_SHEET_NAME, 0);
  var rubrics = ss.insertSheet(RUBRICS_SHEET_NAME, 1);
  ss.deleteSheet(defaultSheet);

  buildRubricsTemplate(rubrics);
  buildGradebookTemplate(gradebook);

  Logger.log("Template spreadsheet created: %s", ss.getUrl());
  Logger.log("Set the TEMPLATE_SPREADSHEET_ID script property to: %s", ss.getId());
  return ss.getId();
}

function buildRubricsTemplate(sheet) {
  var header = ["Category", "Percentage of Section", "This is what an A looks like", "This is what a C looks like", "This is what an F looks like"];
  var numCols = header.length;
  sheet.getRange(1, 2, 1, numCols).setValues([header])
    .setBackground(TEMPLATE_STYLE.headerBg)
    .setFontColor(TEMPLATE_STYLE.headerFg)
    .setFontWeight("bold");
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 90);
  for (var c = 4; c <= 6; c++) sheet.setColumnWidth(c, 260);

  var flat = flattenCategoryStructure();
  var bandIndex = 0;
  flat.forEach(function (entry, i) {
    var row = rubricsRowFor(i);
    var cell = sheet.getRange(row, 2);
    var rowRange = sheet.getRange(row, 2, 1, numCols);
    if (entry.isHeader) {
      cell.setValue(entry.name + " (" + entry.target + "%)");
      rowRange.setBackground(TEMPLATE_STYLE.sectionBg).setFontColor(TEMPLATE_STYLE.sectionFg).setFontWeight("bold");
      bandIndex = 0;
    } else {
      cell.setValue(entry.name);
      rowRange.setBackground(bandIndex % 2 === 0 ? "#ffffff" : TEMPLATE_STYLE.bandBg);
      bandIndex++;
    }
  });

  var lastRow = rubricsRowFor(flat.length - 1);
  sheet.getRange(1, 2, lastRow, numCols)
    .setBorder(true, true, true, true, true, true, TEMPLATE_STYLE.gridColor, SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}

function buildGradebookTemplate(sheet) {
  var flat = flattenCategoryStructure();
  var lastRow = gradebookRowFor(flat.length - 1);
  var lastWeekCol = 3 + DEFAULT_TEMPLATE_WEEKS;
  var lastWeekColLetter = columnToLetter(lastWeekCol);

  sheet.getRange(2, 2).setValue("Current Grade").setFontWeight("bold");
  sheet.getRange(2, 3).setFormula(
    '=IFERROR(SUMPRODUCT(C7:C' + lastRow + ', B7:B' + lastRow + ') / SUMIFS(B7:B' + lastRow + ', C7:C' + lastRow + ', ">=0"), "No Data")'
  );
  sheet.getRange(2, 2, 1, 2)
    .setBackground(TEMPLATE_STYLE.sectionBg)
    .setFontColor(TEMPLATE_STYLE.sectionFg)
    .setFontWeight("bold")
    .setFontSize(12);

  var header = ["Category", "Weight", "Category Grade"];
  for (var w = 1; w <= DEFAULT_TEMPLATE_WEEKS; w++) header.push("Week " + w);
  sheet.getRange(6, 1, 1, header.length).setValues([header])
    .setBackground(TEMPLATE_STYLE.headerBg)
    .setFontColor(TEMPLATE_STYLE.headerFg)
    .setFontWeight("bold");

  var formulaRows = flat.map(function (entry, i) {
    var row = gradebookRowFor(i);
    var rubricsRow = rubricsRowFor(i);
    return [
      "=Rubrics!B" + rubricsRow,
      '=IF(ISBLANK(Rubrics!C' + rubricsRow + '), "", Rubrics!C' + rubricsRow + '/100)',
      '=IF(COUNT(D' + row + ':' + lastWeekColLetter + row + ')>0, AVERAGE(D' + row + ':' + lastWeekColLetter + row + ')/100, "")',
    ];
  });
  sheet.getRange(7, 1, formulaRows.length, 3).setFormulas(formulaRows);

  // Section-header tint + alternating row banding on the sub-item rows —
  // background/font only, column A keeps the formula written above (it pulls
  // the category label from Rubrics!B<row>, never a literal value here).
  var bandIndex = 0;
  flat.forEach(function (entry, i) {
    var row = gradebookRowFor(i);
    var rowRange = sheet.getRange(row, 1, 1, lastWeekCol);
    if (entry.isHeader) {
      rowRange.setBackground(TEMPLATE_STYLE.sectionBg).setFontColor(TEMPLATE_STYLE.sectionFg).setFontWeight("bold");
      bandIndex = 0;
    } else {
      rowRange.setBackground(bandIndex % 2 === 0 ? "#ffffff" : TEMPLATE_STYLE.bandBg);
      bandIndex++;
    }
  });

  sheet.getRange(6, 1, lastRow - 6 + 1, lastWeekCol)
    .setBorder(true, true, true, true, true, true, TEMPLATE_STYLE.gridColor, SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(6);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 220);
}

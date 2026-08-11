/**
 * Backend for the Studio Rubric goal-setting form (../index.html).
 *
 * Setup:
 *   1. Create a Google Sheet, then Extensions > Apps Script, and paste this whole file in as Code.gs.
 *   2. Run `runMeOnceToAuthorize` once from the Apps Script editor and approve the permissions.
 *   3. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone" > Deploy.
 *   4. Copy the Web App URL into SCRIPT_URL at the top of index.html's <script>.
 *   5. Whenever you edit this file, use Manage deployments > edit (pencil) > Version: New > Deploy,
 *      otherwise the live URL keeps serving the old code.
 *
 * Keep CATEGORY_STRUCTURE in sync with the SECTIONS array in index.html — this is the single
 * source of truth for row order, section titles, and percent targets on the backend side.
 */

var RAW_SHEET_NAME = "Raw Data";

var CATEGORY_STRUCTURE = [
  {
    title: "Lessons", target: 70,
    headerColor: "#333333", subColor: "#e6e6e6",
    rows: ["Scales", "Etudes", "Solos", "Excerpts", "Collab Piano", "Other"],
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

var GRADES = ["A", "B", "C", "D", "F"];
var TABLE_HEADER = ["Category", "Percent"].concat(GRADES);

function runMeOnceToAuthorize() {
  SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  return ContentService.createTextOutput("Rubric backend is running.");
}

function doPost(e) {
  var response;
  try {
    var payload = JSON.parse(e.postData.contents);
    if (!payload.studentName || !Array.isArray(payload.categories)) {
      throw new Error("Malformed payload: expected studentName and categories[]");
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var timestamp = new Date();
    appendRawRow(ss, timestamp, payload);
    var sheetName = renderRubricSheet(ss, timestamp, payload);
    response = { ok: true, sheet: sheetName };
  } catch (err) {
    response = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendRawRow(ss, timestamp, payload) {
  var sheet = ss.getSheetByName(RAW_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RAW_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Student Name", "Data (JSON)"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([timestamp, payload.studentName, JSON.stringify(payload)]);
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
      var values = [label, percent, descs.A || "", descs.B || "", descs.C || "", descs.D || "", descs.F || ""];

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

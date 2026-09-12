const SHEET_NAME = "Scores";

function doGet(e) {
  const action = e.parameter.action || "loadScores";
  const callback = e.parameter.callback || "callback";
  const payload = action === "loadScores"
    ? { ok: true, scores: readScores_() }
    : { ok: false, error: "Unknown action" };

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents || "{}");
  if (body.action === "saveScores") {
    writeScores_(body.scores || {});
    return json_({ ok: true });
  }
  return json_({ ok: false, error: "Unknown action" });
}

function readScores_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const scores = {};

  values.slice(1).forEach(([key, t1, t2]) => {
    if (!key) return;
    scores[key] = {
      t1: t1 === "" || t1 === null ? "" : String(t1),
      t2: t2 === "" || t2 === null ? "" : String(t2),
    };
  });

  return scores;
}

function writeScores_(scores) {
  const sheet = getSheet_();
  const rows = [["matchKey", "team1Score", "team2Score", "updatedAt"]];
  const updatedAt = new Date();

  Object.keys(scores).sort().forEach((key) => {
    rows.push([
      key,
      scores[key].t1 || "",
      scores[key].t2 || "",
      updatedAt,
    ]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActive();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([["matchKey", "team1Score", "team2Score", "updatedAt"]]);
  }
  return sheet;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

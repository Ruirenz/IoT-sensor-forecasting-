/**
 * BVI 3114 PBL - IoT Sensor Data Forecasting
 * Algorithm: Holt's linear exponential smoothing with damped trend
 * Sensor: DHT11 (temperature + humidity)
 *
 * Add this as a NEW file in your existing Apps Script project (keep your doPost/doGet).
 * If you already have an onOpen(), merge the menu lines into it instead of keeping two.
 *
 * ASSUMED SHEET LAYOUT (change CONFIG if yours differs):
 *   Column A = Timestamp, Column B = Temperature (C), Column C = Humidity (%)
 */

var CONFIG = {
  DATA_SHEET: 'Sheet1',        // <-- name of the tab your ESP32 writes to
  FORECAST_SHEET: 'Forecasts',
  ACCURACY_SHEET: 'Accuracy',
  TIME_COL: 1,
  TEMP_COL: 2,
  HUM_COL: 3,
  HOURS_AHEAD: 24,             // forecast horizon (hourly steps)
  ALPHA: 0.4,                  // level smoothing (0-1): higher = reacts faster
  BETA: 0.1,                   // trend smoothing (0-1)
  PHI: 0.9,                    // trend damping (<1 stops trend running away)
  MIN_POINTS: 3,               // minimum hourly points needed to forecast
  Z: 1.96,                     // 95% interval
  // DHT11 valid ranges (used to reject bad rows and clamp forecasts)
  TEMP_RANGE: [0, 50],
  HUM_RANGE: [20, 90]
};

// ---------- Menu ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sensor Data')
    .addItem('Generate Forecasts', 'generateForecasts')
    .addItem('Create hourly auto-trigger', 'createHourlyTrigger')
    .addToUi();
}

// ---------- Main entry point (manual or time-driven) ----------
function generateForecasts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = ss.getSheetByName(CONFIG.DATA_SHEET);
  if (!dataSheet || dataSheet.getLastRow() < 2) {
    Logger.log('No data found in sheet "' + CONFIG.DATA_SHEET + '".');
    return;
  }

  var rows = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1,
                                Math.max(CONFIG.HUM_COL, CONFIG.TEMP_COL)).getValues();

  var temp = buildHourlySeries_(rows, CONFIG.TEMP_COL - 1, CONFIG.TEMP_RANGE);
  var hum  = buildHourlySeries_(rows, CONFIG.HUM_COL - 1,  CONFIG.HUM_RANGE);

  if (temp.values.length < CONFIG.MIN_POINTS || hum.values.length < CONFIG.MIN_POINTS) {
    Logger.log('Not enough hourly data yet (need ' + CONFIG.MIN_POINTS + ' hours).');
    SpreadsheetApp.getActiveSpreadsheet().toast('Not enough hourly data yet to forecast.');
    return;
  }

  var fT = holtForecast_(temp.values, CONFIG.HOURS_AHEAD, CONFIG.TEMP_RANGE);
  var fH = holtForecast_(hum.values,  CONFIG.HOURS_AHEAD, CONFIG.HUM_RANGE);

  writeForecasts_(ss, temp.lastHour, fT, fH);
  writeAccuracy_(ss, temp, hum, fT, fH);
}

// ---------- Step 1: clean data and resample to hourly averages ----------
function buildHourlySeries_(rows, valueIdx, range) {
  var HOUR = 3600000;
  var buckets = {};
  for (var i = 0; i < rows.length; i++) {
    var t = new Date(rows[i][CONFIG.TIME_COL - 1]);
    var v = parseFloat(rows[i][valueIdx]);
    // skip blank/invalid timestamps and out-of-range or NaN readings
    if (isNaN(t.getTime()) || isNaN(v) || v < range[0] || v > range[1]) continue;
    var key = Math.floor(t.getTime() / HOUR);
    if (!buckets[key]) buckets[key] = { sum: 0, n: 0 };
    buckets[key].sum += v;
    buckets[key].n++;
  }
  var keys = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
  if (keys.length === 0) return { values: [], lastHour: null };

  // fill gaps (e.g. ESP32 offline) by carrying the previous hour forward
  var values = [];
  var last = null;
  for (var k = keys[0]; k <= keys[keys.length - 1]; k++) {
    if (buckets[k]) last = buckets[k].sum / buckets[k].n;
    values.push(last);
  }
  return { values: values, lastHour: new Date(keys[keys.length - 1] * HOUR) };
}

// ---------- Step 2: Holt's damped-trend exponential smoothing ----------
function holtForecast_(y, h, range) {
  var a = CONFIG.ALPHA, b = CONFIG.BETA, phi = CONFIG.PHI;
  var level = y[0];
  var trend = y[1] - y[0];
  var errors = [];

  for (var t = 1; t < y.length; t++) {
    var pred = level + phi * trend;            // one-step-ahead prediction
    errors.push(y[t] - pred);
    var newLevel = a * y[t] + (1 - a) * pred;
    trend = b * (newLevel - level) + (1 - b) * phi * trend;
    level = newLevel;
  }

  // residual standard deviation -> prediction interval
  var sse = 0;
  for (var e = 0; e < errors.length; e++) sse += errors[e] * errors[e];
  var sigma = Math.sqrt(sse / Math.max(errors.length, 1));

  var out = [];
  var cum = 0;
  for (var i = 1; i <= h; i++) {
    cum += Math.pow(phi, i);
    var f = level + cum * trend;
    var margin = CONFIG.Z * sigma * Math.sqrt(i);   // widens with horizon
    out.push({
      value: clamp_(f, range),
      upper: clamp_(f + margin, range),
      lower: clamp_(f - margin, range)
    });
  }
  out.errors = errors;
  return out;
}

function clamp_(v, range) {
  return Math.min(range[1], Math.max(range[0], v));
}

// ---------- Step 3: write forecasts to a separate sheet ----------
function writeForecasts_(ss, lastHour, fT, fH) {
  var sheet = ss.getSheetByName(CONFIG.FORECAST_SHEET) || ss.insertSheet(CONFIG.FORECAST_SHEET);
  sheet.clear();
  var header = ['Timestamp', 'Temp Forecast', 'Temp Upper', 'Temp Lower',
                'Humidity Forecast', 'Humidity Upper', 'Humidity Lower'];
  var out = [header];
  for (var i = 0; i < fT.length; i++) {
    var ts = new Date(lastHour.getTime() + (i + 1) * 3600000);
    out.push([ts,
      round_(fT[i].value), round_(fT[i].upper), round_(fT[i].lower),
      round_(fH[i].value), round_(fH[i].upper), round_(fH[i].lower)]);
  }
  sheet.getRange(1, 1, out.length, header.length).setValues(out);
  sheet.getRange(2, 1, out.length - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
}

// ---------- Step 4: accuracy metrics (in-sample, one-step-ahead) ----------
function writeAccuracy_(ss, temp, hum, fT, fH) {
  var sheet = ss.getSheetByName(CONFIG.ACCURACY_SHEET) || ss.insertSheet(CONFIG.ACCURACY_SHEET);
  sheet.clear();
  var mT = metrics_(temp.values, fT.errors);
  var mH = metrics_(hum.values, fH.errors);
  var rows = [
    ['Metric', 'Temperature', 'Humidity'],
    ['MAE', round_(mT.mae), round_(mH.mae)],
    ['RMSE', round_(mT.rmse), round_(mH.rmse)],
    ['MAPE (%)', round_(mT.mape), round_(mH.mape)],
    ['Hourly points used', temp.values.length, hum.values.length],
    ['Last run', new Date(), '']
  ];
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
}

function metrics_(y, errors) {
  var n = errors.length, ae = 0, se = 0, pe = 0;
  for (var i = 0; i < n; i++) {
    ae += Math.abs(errors[i]);
    se += errors[i] * errors[i];
    pe += Math.abs(errors[i] / (y[i + 1] || 1)) * 100;
  }
  return { mae: ae / n, rmse: Math.sqrt(se / n), mape: pe / n };
}

function round_(v) { return Math.round(v * 100) / 100; }

// ---------- Optional: run automatically every hour ----------
function createHourlyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'generateForecasts') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('generateForecasts').timeBased().everyHours(1).create();
}

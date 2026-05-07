var doc = app.documents.add(DocumentColorSpace.RGB, 1000, 1000);
doc.rulerUnits = RulerUnits.Pixels;

function rgb(r, g, b) {
  var c = new RGBColor();
  c.red = r;
  c.green = g;
  c.blue = b;
  return c;
}

function addLayer(name) {
  var layer = doc.layers.add();
  layer.name = name;
  return layer;
}

function rect(layer, top, left, width, height, fillColor, strokeColor, strokeWidth) {
  var p = layer.pathItems.rectangle(top, left, width, height);
  p.filled = !!fillColor;
  if (fillColor) p.fillColor = fillColor;
  p.stroked = !!strokeColor;
  if (strokeColor) {
    p.strokeColor = strokeColor;
    p.strokeWidth = strokeWidth || 1;
  }
  return p;
}

function ellipse(layer, top, left, width, height, fillColor, strokeColor, strokeWidth) {
  var p = layer.pathItems.ellipse(top, left, width, height);
  p.filled = !!fillColor;
  if (fillColor) p.fillColor = fillColor;
  p.stroked = !!strokeColor;
  if (strokeColor) {
    p.strokeColor = strokeColor;
    p.strokeWidth = strokeWidth || 1;
  }
  return p;
}

function line(layer, points, strokeColor, strokeWidth) {
  var p = layer.pathItems.add();
  p.setEntirePath(points);
  p.filled = false;
  p.stroked = true;
  p.strokeColor = strokeColor;
  p.strokeWidth = strokeWidth || 1;
  try {
    p.strokeCap = StrokeCap.ROUNDENDCAP;
    p.strokeJoin = StrokeJoin.ROUNDENDJOIN;
  } catch (e) {}
  return p;
}

function polygon(layer, points, fillColor, strokeColor, strokeWidth) {
  var p = layer.pathItems.add();
  p.setEntirePath(points);
  p.closed = true;
  p.filled = !!fillColor;
  if (fillColor) p.fillColor = fillColor;
  p.stroked = !!strokeColor;
  if (strokeColor) {
    p.strokeColor = strokeColor;
    p.strokeWidth = strokeWidth || 1;
  }
  return p;
}

function text(layer, content, fontName, size, tracking, fillColor, x, top) {
  var t = layer.textFrames.add();
  t.contents = content;
  t.textRange.characterAttributes.textFont = app.textFonts.getByName(fontName);
  t.textRange.characterAttributes.size = size;
  t.textRange.characterAttributes.tracking = tracking;
  t.textRange.characterAttributes.fillColor = fillColor;
  t.position = [x || 0, top || 0];
  return t;
}

function centerText(t, cx, cy) {
  t.position = [cx - t.width / 2, cy + t.height / 2];
}

var ivory = rgb(246, 241, 229);
var ink = rgb(17, 20, 19);
var warmBlack = rgb(9, 14, 14);
var gold = rgb(184, 132, 55);
var paleGold = rgb(222, 199, 143);
var mist = rgb(235, 226, 204);

doc.layers[0].name = "03 Decimal wordmark";
var wordLayer = doc.layers[0];
var accentLayer = addLayer("02 custom Savoy accents");
var bgLayer = addLayer("01 ivory background");

rect(bgLayer, 1000, 0, 1000, 1000, ivory, null, 0);

// Outer quiet border.
rect(accentLayer, 934, 66, 868, 868, null, mist, 1.35);
rect(accentLayer, 908, 92, 816, 816, null, paleGold, 0.75);

// Monogram seal.
ellipse(accentLayer, 856, 399, 202, 202, null, ink, 2.5);
ellipse(accentLayer, 842, 413, 174, 174, null, gold, 1.65);
line(accentLayer, [[354, 756], [240, 756]], gold, 2.25);
line(accentLayer, [[646, 756], [760, 756]], gold, 2.25);
line(accentLayer, [[380, 734], [282, 734]], mist, 1);
line(accentLayer, [[620, 734], [718, 734]], mist, 1);

var monogram = text(wordLayer, "S", "DecimalBlackItalic", 162, -10, ink, 0, 0);
centerText(monogram, 494, 745);

// Main Decimal wordmark, with a restrained champagne offset.
var shadow = text(wordLayer, "Savoy", "DecimalBlackItalic", 186, -22, gold, 0, 0);
shadow.opacity = 28;
shadow.position = [500 - shadow.width / 2 + 8, 554 - 8];

var main = text(wordLayer, "Savoy", "DecimalBlackItalic", 186, -22, warmBlack, 0, 0);
main.position = [500 - main.width / 2, 554];

// Calculate a custom halo around the "o" from the rendered word width.
var oCenterX = main.position[0] + main.width * 0.716;
var oCenterY = main.position[1] - main.height * 0.43;
ellipse(accentLayer, oCenterY + 72, oCenterX - 72, 144, 144, null, gold, 3.2);
ellipse(accentLayer, oCenterY + 50, oCenterX - 50, 100, 100, null, paleGold, 0.9);
line(accentLayer, [[oCenterX - 86, oCenterY - 2], [oCenterX + 86, oCenterY - 2]], gold, 2.2);

// V-shaped signature beneath the word: a subtle stage-curtain nod.
polygon(accentLayer, [[470, 328], [500, 286], [530, 328], [516, 328], [500, 307], [484, 328]], gold, null, 0);
line(accentLayer, [[248, 350], [452, 350]], gold, 2.5);
line(accentLayer, [[548, 350], [752, 350]], gold, 2.5);
line(accentLayer, [[312, 326], [688, 326]], mist, 1);

// Tiny registration mark built from Decimal Medium, kept subtle.
var sub = text(wordLayer, "SAVOY", "DecimalMedium", 23, 210, ink, 0, 0);
sub.opacity = 65;
centerText(sub, 500, 247);

// Arrange layer order and focus the finished artwork.
bgLayer.zOrder(ZOrderMethod.SENDTOBACK);
accentLayer.zOrder(ZOrderMethod.BRINGFORWARD);
wordLayer.zOrder(ZOrderMethod.BRINGTOFRONT);

doc.selection = null;
app.activeDocument = doc;
try {
  app.executeMenuCommand("fitin");
} catch (e) {}

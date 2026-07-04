/* ═══════════════════════════════════════════════════════
   LAGENCO — Google Apps Script
   Dit script plak je in Google Sheets → Extensions → Apps Script
   
   SETUP:
   1. Maak een nieuwe Google Spreadsheet
   2. Maak tabbladen: Producten, Biedingen, Community, Comments, Coupons, Settings
   3. Ga naar Extensions → Apps Script
   4. Verwijder alle bestaande code
   5. Plak deze code
   6. Klik Deploy → New deployment
   7. Type: Web app
   8. Execute as: Me
   9. Who has access: Anyone
   10. Kopieer de URL en vul in sheets-client.js
   ═══════════════════════════════════════════════════════ */

function doGet(e) {
  // e is undefined als je in de editor op "Run" klikt — dat is normaal
  // Je hoeft deze code NIET te runnen in de editor
  // Je moet hem DEPLOYEN als Web App (Deploy → New deployment → Web app)
  var action = (e && e.parameter) ? e.parameter.action : null;
  
  if (!action) {
    return json({ status: 'ok', message: 'Lagenco API is running. Voeg ?action=getProducts toe aan de URL om data op te halen.' });
  }
  
  if (action === 'getProducts') {
    return json(getProducts());
  }
  if (action === 'getBids') {
    return json(getBids());
  }
  if (action === 'getPosts') {
    return json(getPosts());
  }
  if (action === 'getCoupons') {
    return json(getCoupons());
  }
  if (action === 'getWheelSettings') {
    return json(getWheelSettings());
  }
  if (action === 'getResetToken') {
    return json({ token: getResetToken() });
  }
  
  return json({ status: 'ok', message: 'Lagenco API running' });
}

function doPost(e) {
  // Google Apps Script ontvangt POST als text/plain (om CORS te voorkomen)
  if (!e || !e.postData) {
    return json({ status: 'error', message: 'No data received' });
  }
  var rawBody = e.postData.contents;
  var data;
  try {
    data = JSON.parse(rawBody);
  } catch (err) {
    return json({ status: 'error', message: 'Invalid JSON: ' + err.message });
  }
  var action = data.action;
  
  if (action === 'saveProduct') {
    saveProduct(data.product);
    return json({ status: 'ok' });
  }
  if (action === 'deleteProduct') {
    deleteProduct(data.id);
    return json({ status: 'ok' });
  }
  if (action === 'saveBid') {
    saveBid(data.bid);
    return json({ status: 'ok' });
  }
  if (action === 'updateBidStatus') {
    updateBidStatus(data.id, data.status);
    return json({ status: 'ok' });
  }
  if (action === 'deleteBid') {
    deleteBid(data.id);
    return json({ status: 'ok' });
  }
  if (action === 'savePost') {
    savePost(data.post);
    return json({ status: 'ok' });
  }
  if (action === 'deletePost') {
    deletePost(data.id);
    return json({ status: 'ok' });
  }
  if (action === 'saveComment') {
    saveComment(data.postId, data.comment);
    return json({ status: 'ok' });
  }
  if (action === 'deleteComment') {
    deleteComment(data.commentId);
    return json({ status: 'ok' });
  }
  if (action === 'saveCoupon') {
    saveCoupon(data.coupon);
    return json({ status: 'ok' });
  }
  if (action === 'updateCouponStatus') {
    updateCouponStatus(data.code, data.status);
    return json({ status: 'ok' });
  }
  if (action === 'saveWheelSettings') {
    saveWheelSettings(data.settings);
    return json({ status: 'ok' });
  }
  if (action === 'saveResetToken') {
    saveResetToken(data.token);
    return json({ status: 'ok' });
  }
  
  return json({ status: 'error', message: 'Unknown action: ' + action });
}

// ═══ Helper: JSON response ═══
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══ Helper: Get or create sheet ═══
function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ═══ PRODUCTEN ═══
function getProducts() {
  var sheet = getSheet('Producten');
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { products: [] };
  
  var products = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    products.push({
      id: data[i][0],
      title: data[i][1],
      description: data[i][2] || '',
      price: parseFloat(data[i][3]) || 0,
      oldPrice: data[i][4] ? parseFloat(data[i][4]) : null,
      badge: data[i][5] || 'Uitgelicht',
      condition: parseInt(data[i][6]) || 0,
      image: data[i][7] || '',
      images: data[i][8] ? JSON.parse(data[i][8]) : [],
      createdAt: parseInt(data[i][9]) || Date.now()
    });
  }
  return { products: products };
}

function saveProduct(product) {
  var sheet = getSheet('Producten');
  // Check if headers exist
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'Title', 'Description', 'Price', 'OldPrice', 'Badge', 'Condition', 'Image', 'Images', 'CreatedAt']);
  }
  
  // Find existing row
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === product.id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  var row = [
    product.id,
    product.title,
    product.description || '',
    product.price,
    product.oldPrice || '',
    product.badge || 'Uitgelicht',
    product.condition || 0,
    product.image || '',
    JSON.stringify(product.images || []),
    product.createdAt || Date.now()
  ];
  
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function deleteProduct(id) {
  var sheet = getSheet('Producten');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// ═══ BIEDINGEN ═══
function getBids() {
  var sheet = getSheet('Biedingen');
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { bids: [] };
  
  var bids = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    bids.push({
      id: data[i][0],
      productId: data[i][1],
      productTitle: data[i][2] || '',
      productPrice: parseFloat(data[i][3]) || 0,
      name: data[i][4],
      email: data[i][5],
      phone: data[i][6] || '',
      amount: parseFloat(data[i][7]) || 0,
      shippingMethod: data[i][8] || '',
      shippingMethodKey: data[i][9] || '',
      street: data[i][10] || '',
      houseNumber: data[i][11] || '',
      houseNumberAdd: data[i][12] || '',
      postalCode: data[i][13] || '',
      city: data[i][14] || '',
      country: data[i][15] || 'Nederland',
      fullAddress: data[i][16] || '',
      note: data[i][17] || '',
      status: data[i][18] || 'in_afwachting',
      createdAt: data[i][19] || new Date().toISOString(),
      updatedAt: data[i][20] || null
    });
  }
  return { bids: bids };
}

function saveBid(bid) {
  var sheet = getSheet('Biedingen');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'ProductID', 'ProductTitle', 'ProductPrice', 'Name', 'Email', 'Phone', 'Amount', 'ShippingMethod', 'ShippingMethodKey', 'Street', 'HouseNumber', 'HouseNumberAdd', 'PostalCode', 'City', 'Country', 'FullAddress', 'Note', 'Status', 'CreatedAt', 'UpdatedAt']);
  }
  
  sheet.appendRow([
    bid.id, bid.productId, bid.productTitle, bid.productPrice,
    bid.name, bid.email, bid.phone || '', bid.amount,
    bid.shippingMethod || '', bid.shippingMethodKey || '',
    bid.street || '', bid.houseNumber || '', bid.houseNumberAdd || '',
    bid.postalCode || '', bid.city || '', bid.country || 'Nederland',
    bid.fullAddress || '', bid.note || '', bid.status || 'in_afwachting',
    bid.createdAt, ''
  ]);
}

function updateBidStatus(id, status) {
  var sheet = getSheet('Biedingen');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 19).setValue(status); // Status column
      sheet.getRange(i + 1, 21).setValue(new Date().toISOString()); // UpdatedAt
      break;
    }
  }
}

function deleteBid(id) {
  var sheet = getSheet('Biedingen');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// ═══ COMMUNITY POSTS ═══
function getPosts() {
  var postsSheet = getSheet('Community');
  var commentsSheet = getSheet('Comments');
  
  var postData = postsSheet.getDataRange().getValues();
  var commentData = commentsSheet.getDataRange().getValues();
  
  var posts = [];
  for (var i = 1; i < postData.length; i++) {
    if (!postData[i][0]) continue;
    var postId = postData[i][0];
    var comments = [];
    for (var j = 1; j < commentData.length; j++) {
      if (commentData[j][1] === postId) {
        comments.push({
          id: commentData[j][0],
          username: commentData[j][2],
          text: commentData[j][3],
          createdAt: commentData[j][4] || new Date().toISOString()
        });
      }
    }
    posts.push({
      id: postId,
      title: postData[i][1],
      body: postData[i][2],
      author: postData[i][3] || 'Lagenco',
      image: postData[i][4] || null,
      createdAt: postData[i][5] || new Date().toISOString(),
      comments: comments
    });
  }
  return { posts: posts };
}

function savePost(post) {
  var sheet = getSheet('Community');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'Title', 'Body', 'Author', 'Image', 'CreatedAt']);
  }
  
  // Check if exists
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === post.id) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        post.id, post.title, post.body, post.author || 'Lagenco',
        post.image || '', post.createdAt
      ]]);
      return;
    }
  }
  
  sheet.appendRow([
    post.id, post.title, post.body, post.author || 'Lagenco',
    post.image || '', post.createdAt
  ]);
}

function deletePost(id) {
  var sheet = getSheet('Community');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  // Also delete comments
  var cSheet = getSheet('Comments');
  var cData = cSheet.getDataRange().getValues();
  for (var j = cData.length - 1; j >= 1; j--) {
    if (cData[j][1] === id) {
      cSheet.deleteRow(j + 1);
    }
  }
}

function saveComment(postId, comment) {
  var sheet = getSheet('Comments');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'PostID', 'Username', 'Text', 'CreatedAt']);
  }
  sheet.appendRow([
    comment.id, postId, comment.username, comment.text, comment.createdAt
  ]);
}

function deleteComment(commentId) {
  var sheet = getSheet('Comments');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === commentId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// ═══ WHEEL SPIN COUPONS ═══
function getCoupons() {
  var sheet = getSheet('Coupons');
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { coupons: [] };
  
  var coupons = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    coupons.push({
      code: data[i][0],
      type: data[i][1],
      label: data[i][2] || '',
      winnerName: data[i][3] || '',
      winnerEmail: data[i][4] || '',
      status: data[i][5] || 'ongebruikt',
      wonAt: data[i][6] || new Date().toISOString(),
      usedAt: data[i][7] || null
    });
  }
  return { coupons: coupons };
}

function saveCoupon(coupon) {
  var sheet = getSheet('Coupons');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Code', 'Type', 'Label', 'WinnerName', 'WinnerEmail', 'Status', 'WonAt', 'UsedAt']);
  }
  sheet.appendRow([
    coupon.code, coupon.type, coupon.label || '',
    coupon.winnerName || '', coupon.winnerEmail || '',
    coupon.status || 'ongebruikt', coupon.wonAt, ''
  ]);
}

function updateCouponStatus(code, status) {
  var sheet = getSheet('Coupons');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      sheet.getRange(i + 1, 6).setValue(status);
      if (status === 'gebruikt') {
        sheet.getRange(i + 1, 8).setValue(new Date().toISOString());
      } else {
        sheet.getRange(i + 1, 8).setValue('');
      }
      break;
    }
  }
}

// ═══ WHEEL SETTINGS ═══
function getWheelSettings() {
  var sheet = getSheet('Settings');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'wheelSettings') {
      return { settings: JSON.parse(data[i][1]) };
    }
  }
  return { settings: null };
}

function saveWheelSettings(settings) {
  var sheet = getSheet('Settings');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Key', 'Value']);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'wheelSettings') {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(settings));
      return;
    }
  }
  sheet.appendRow(['wheelSettings', JSON.stringify(settings)]);
}

// ═══ RESET TOKEN ═══
function getResetToken() {
  var sheet = getSheet('Settings');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'resetToken') {
      return data[i][1];
    }
  }
  return 'reset_initial';
}

function saveResetToken(token) {
  var sheet = getSheet('Settings');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Key', 'Value']);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'resetToken') {
      sheet.getRange(i + 1, 2).setValue(token);
      return;
    }
  }
  sheet.appendRow(['resetToken', token]);
}

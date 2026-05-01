// ═══════════════════════════════════════════
// CONFIG — Firebase + dbMock + initFirebase
// ═══════════════════════════════════════════
var firebaseConfig = {
  apiKey:            "AIzaSyA_xvCKbgCMA6KuhVauF7LROsjk1_GVe0I",
  authDomain:        "agenda-bruna-nara.firebaseapp.com",
  databaseURL:       "https://agenda-bruna-nara-default-rtdb.firebaseio.com",
  projectId:         "agenda-bruna-nara",
  storageBucket:     "agenda-bruna-nara.firebasestorage.app",
  messagingSenderId: "597964526769",
  appId:             "1:597964526769:web:59699c82b8e6947ac07e90"
};

// ─── FIREBASE MOCK (modo offline / sin conexión) ──────────────────────────────
// Cada método devuelve self para encadenamiento. push/update/remove devuelven
// Promises resueltas para que el código async no se rompa.
var dbMock = (function() {
  function makeRef() {
    var self = {
      on:           function(ev, cb, errCb) { return self; },
      off:          function()              { return self; },
      once:         function(ev, cb)        { if(cb) cb({val:function(){return null;}}); return Promise.resolve({val:function(){return null;}}); },
      push:         function(data)          { return Promise.resolve({key:'local_'+Date.now()}); },
      update:       function(data)          { return Promise.resolve(); },
      set:          function(data)          { return Promise.resolve(); },
      remove:       function()              { return Promise.resolve(); },
      orderByChild: function()              { return self; },
      startAt:      function()              { return self; },
      endAt:        function()              { return self; },
      limitToLast:  function()              { return self; },
      limitToFirst: function()              { return self; }
    };
    return self;
  }
  return { ref: function() { return makeRef(); } };
}());

var db = dbMock;
var modoLocal = true;
var firebaseIniciado = false;

function initFirebase() {
  if (firebaseIniciado) return; // evitar doble inicialización
  try {
    if (typeof firebase !== 'undefined' && typeof firebase.initializeApp === 'function') {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      modoLocal = false;
      firebaseIniciado = true;
    }
  } catch(e) {
    db = dbMock;
    modoLocal = true;
  }
}

// ─── USUARIOS Y AUTENTICACIÓN ─────────────────────────────────────────────────
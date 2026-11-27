/* SafeGate native bridge. Does nothing in a normal browser. Inside the Capacitor app (Android/iOS) it adds:
 *  - location that keeps working with the screen off (foreground service with a visible notification)
 *  - phone alerts through Firebase (works when the app is closed)
 * Plugins used: @capacitor-community/background-geolocation, @capacitor/push-notifications */
(function () {
  'use strict';
  var C = window.Capacitor, N = window.SGNative = { isNative: false };
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
  N.isNative = true; N.platform = C.getPlatform ? C.getPlatform() : 'native';
  var BG = C.registerPlugin('BackgroundGeolocation'), PN = C.registerPlugin('PushNotifications');
  var watcher = null, starting = false, reasons = {}, handler = null, lastErr = '';

  function count() { return Object.keys(reasons).length; }
  /* reason: 'track' (trip with sharing on) or 'sos'. Runs while at least one reason is active. */
  N.want = function (reason, onLoc) {
    reasons[reason] = 1; handler = onLoc || handler;
    if (watcher || starting) return;
    starting = true;
    BG.addWatcher({
      backgroundTitle: 'SafeGate is on',
      backgroundMessage: 'Sharing your location with school security while you are out.',
      requestPermissions: true, stale: false, distanceFilter: 0
    }, function (loc, err) {
      if (err) { lastErr = err.code || 'error'; if (err.code === 'NOT_AUTHORIZED' && window.confirm('SafeGate needs Location set to "Allow all the time" to keep you safe with the screen off. Open settings now?')) BG.openSettings(); return; }
      lastErr = ''; if (handler && loc) handler({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy, t: loc.time || Date.now() });
    }).then(function (id) { watcher = id; starting = false; if (!count()) N.release(); }, function () { starting = false; });
  };
  N.release = function (reason) {
    if (reason) delete reasons[reason];
    if (count() || !watcher) return;
    var id = watcher; watcher = null; BG.removeWatcher({ id: id }).catch(function () {});
  };
  N.status = function () { return watcher ? 'running' : lastErr || 'stopped'; };
  N.openSettings = function () { return BG.openSettings(); };

  /* phone alerts: onToken(fcmToken) is called whenever Firebase gives (or renews) this phone's token */
  var pushReady = false;
  N.registerPush = function (onToken) {
    if (pushReady) return Promise.resolve(); pushReady = true;
    try { PN.createChannel({ id: 'sg_alerts', name: 'Emergency and urgent', importance: 5, visibility: 1, vibration: true, lights: true }); PN.createChannel({ id: 'sg_info', name: 'Updates', importance: 3, visibility: 1 }); } catch (e) {}
    PN.addListener('registration', function (t) { if (t && t.value) onToken(t.value); });
    PN.addListener('registrationError', function (e) { pushReady = false; lastErr = 'push:' + (e && e.error || ''); });
    return PN.requestPermissions().then(function (r) { if (r.receive === 'granted') return PN.register(); pushReady = false; });
  };
})();

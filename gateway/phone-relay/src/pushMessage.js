// The Firebase Cloud Messaging message for one sealed notice. Data only: the phone's own
// code (the iOS notification extension, the Android push service) opens it with the phone's
// key. Apple shows "New activity" only if the extension can't open it in time.
export function pushMessage(token, sealed) {
  return {
    token,
    data: { sealed },
    android: { priority: 'high' },
    apns: { payload: { aps: { 'mutable-content': 1, alert: { title: 'Alphonso', body: 'New activity' } } } },
  };
}

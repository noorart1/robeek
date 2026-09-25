
// Every API route answers 401 once the session has expired or been
// removed; send the user back to the login page instead of showing a
// generic error they cannot fix.

export const SESSION_EXPIRED = "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.";

export function redirectIfSignedOut(response) {
  if (response.status !== 401) return false;

  window.location.replace("/login");
  return true;
}

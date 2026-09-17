const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contextPath = path.join(root, 'app', 'contexts', 'LanguageContext.tsx');
const contextSource = fs.readFileSync(contextPath, 'utf8');
const spanishBlock = contextSource.match(/es:\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\};/);

if (!spanishBlock) {
  throw new Error('Could not find the Spanish translation table.');
}

const translatedKeys = new Set();
for (const match of spanishBlock[1].matchAll(/^\s*("(?:\\.|[^"\\])*")\s*:/gm)) {
  translatedKeys.add(JSON.parse(match[1]));
}
for (const match of spanishBlock[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*"/gm)) translatedKeys.add(match[1]);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const missing = new Map();
const allFiles = [
  ...sourceFiles(path.join(root, 'app')),
  ...sourceFiles(path.join(root, 'components')),
  ...sourceFiles(path.join(root, 'services')),
];
for (const file of allFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*(["'])(.*?)\1/gs)) {
    const key = match[2];
    if (translatedKeys.has(key)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const locations = missing.get(key) || [];
    locations.push(`${path.relative(root, file)}:${line}`);
    missing.set(key, locations);
  }
}

// These strings reach t() through variables, ternaries, service-returned copy,
// or shared label arrays, so a literal-call scan cannot discover them.
const dynamicUiKeys = [
  'A newer sign-in attempt replaced this one.',
  'Acknowledge', 'Acknowledge and add location', 'Add signature',
  'Add your job and locations, then read your JSA.', 'Adding…',
  'Already completed', 'Already registered?',
  'Checking thermal printer…', 'Closed', 'Closed JSA', 'Closing…',
  'Could not load your JSAs. Check your sign-in and retry.',
  'Could not refresh JSAs. Showing records available on this phone. Retry when connected.',
  'Could not save printer settings. Try again.', 'Could not sign in',
  'Create a passcode', 'Create Passcode', 'Display name (e.g., MBurger)', 'Display Name',
  'End standalone day', 'Enter your info to register with your company',
  'Enter your name and passcode to sign in', 'New Employee Registration', 'New employee?',
  'No paired devices found. Pair your printer in Android Bluetooth settings.',
  'No published task assessments are available.', 'Ongoing JSA', 'Opening regular printer…',
  'Other', 'Paired devices refreshed. Tap the printer you want to use.', 'Passcode',
  'Passcode contains invalid characters', 'Passcode must be 12 characters or less',
  'Passcode must be at least 6 characters', 'Please create a passcode',
  'Read', 'Read and acknowledged', 'Register here', 'Retry when connected.',
  'Return to WellBuilt Tickets', 'Saved JSA', 'Saving…', 'Shift JSA', 'Sign In', 'Sign in',
  'Sign out could not be verified.', 'Signature captured', 'Signing out...',
  'Some JSAs could not close. The remaining open records are shown below.',
  'Some shift statuses could not be verified. Saved JSAs remain available.',
  'Standalone', 'Submitting your registration...', 'Submit Registration',
  'The previous printer is no longer paired. Tap the printer you want to use below.',
  'Today', 'Unfinished JSA', 'Unfinished JSAs', 'Verifying your passcode...',
  'WellBuilt Suite is not installed on this device.', 'Your job details are ready. Continue to read your JSA.',
  'Your Name', 'Your name', 'Your passcode', '{app} is not installed on this device.',
  '{count} well:', '{count} wells:',
  'Current WellBuilt shift could not be verified. Return to WellBuilt and try again.',
  'Signing in to WellBuilt JSA…', 'Opening WellBuilt JSA…',
  'Could not sign in to WellBuilt JSA. Return to WellBuilt Tickets and launch again.',
  'Company join code is required', 'Enter the 8-character company join code',
  'Company join code was not found', 'Company is not available for employee registration',
  'A registration for this name is already pending',
  'Connection error', 'Passcode must be 6–128 characters',
  'Pending registration could not be cleared. Sign in or try again.',
  'Registration did not return a pending request',
  'Registration request expired. Please register again.',
  'Invalid name or passcode.', 'This account has been deactivated.',
  'Secure sign-in is not available for this account. Contact support.',
  'Unable to reach WellBuilt. Check your connection and try again.',
  'WellBuilt sign-in is temporarily unavailable. Try again.',
  'Secure sign-in could not verify this JSA session.',
  'Your JSA could not be saved on this device. Stay here and try again. Do not return to Tickets yet.',
  'Your JSA is saved on this device, but WellBuilt could not record completion. Stay here and tap Retry. Do not return to Tickets yet.',
];
for (const key of dynamicUiKeys) {
  if (!translatedKeys.has(key)) missing.set(key, ['dynamic UI copy']);
}

// Direct Text children are always visible and must not bypass t(). The WB
// monogram is the only intentional literal copy in a Text element.
for (const file of allFiles.filter((file) => /\.(tsx)$/.test(file))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<Text\b[^>]*>\s*([A-Za-z][^<{<]*)<\/Text>/g)) {
    const raw = match[1].trim();
    if (!raw || raw === 'WB') continue;
    const line = source.slice(0, match.index).split('\n').length;
    missing.set(`raw JSX: ${raw}`, [`${path.relative(root, file)}:${line}`]);
  }
}

if (missing.size) {
  for (const [key, locations] of [...missing].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`${JSON.stringify(key)}: ${locations.join(', ')}`);
  }
  throw new Error(`${missing.size} translated UI strings are missing Spanish entries.`);
}

console.log(`i18n key coverage passed (${translatedKeys.size} Spanish entries).`);

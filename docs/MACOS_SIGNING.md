# macOS signing & notarization

`release.yml`'s `build-macos` job signs with a Developer ID certificate and
notarizes through Apple when the secrets below exist. Without them it still
builds, but the DMG is unsigned and Gatekeeper blocks it on macOS Sequoia+.

## One-time setup (needs a Mac and a paid Apple Developer account)

1. **Certificate.** Xcode → Settings → Accounts → Manage Certificates → `+` →
   *Developer ID Application*. (Or developer.apple.com → Certificates.)
2. **Export.** Keychain Access → My Certificates → right-click the
   "Developer ID Application: …" entry → Export as `.p12` with a password.
3. **App-specific password.** appleid.apple.com → Sign-In and Security →
   App-Specific Passwords → create one named `alphonso-notary`.
4. **Team ID.** developer.apple.com → Membership details (10 characters).
5. **Add repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | exact name from `security find-identity -v -p codesigning` |
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | Team ID |

Delete the local `.p12` afterwards; never commit it.

## What the job does

1. Imports the certificate into a temporary keychain (skipped if secrets absent).
2. Signs every Mach-O file under `src-tauri/vendor/ollama` with the hardened
   runtime. Tauri treats these as opaque resources, and Apple rejects the
   whole submission if any bundled binary is unsigned.
3. `tauri build` signs the app with `entitlements.plist`, submits to the
   notary service, and staples the ticket.
4. Verifies with `codesign --verify --deep --strict`, `stapler validate`,
   and `spctl --assess`. A failure here fails the release.

## Verify locally on a Mac

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Alphonso.app
spctl --assess --type execute --verbose=4 /Applications/Alphonso.app
xcrun stapler validate /Applications/Alphonso.app
```

Test the DMG as a user would: download it through a browser (so it carries
the quarantine flag) and open it on a Mac that has never seen it.

## Not covered

Intel/universal builds (Apple Silicon only), and Windows code signing.

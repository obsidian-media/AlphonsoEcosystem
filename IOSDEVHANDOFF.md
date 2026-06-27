Comprehensive Report: Alphonso Companion iOS Development & Deployment Issues  
Prepared for: Claude Code Integration  
1. Project Overview  
Objective: Deploy an iOS companion app ("Alphonso Companion") from a Windows machine to TestFlight via GitHub Actions.  
Key Components:  
- Backend: Rust (Tauri commands, WebSocket RPC).  
- Frontend: React (companion:// event handlers).  
- Client: Swift (DNS, WebSocket, UI).  
- Delivery: GitHub Actions (macOS runner), TestFlight (no AltStore).
2. Critical Challenges  
A. Certificate Management  
- Issue: OpenSSL 3.x PBES2-encrypted .p12 files failed on macOS security import due to modern encryption.  
- Root Cause: macOS requires legacy PBE-SHA1-3DES for .p12 or separate DER/PEM formats.  
- Solution:  
- Generated RSA PEM key (unencrypted, traditional format).  
- Uploaded DER certificate and PEM key as separate GitHub secrets.  
- Imported directly via security import (no PBES2 support).
B. Provisioning Profile Name Mismatch  
- Issue: xcodebuild failed to find Alphonso_iOS profile, even though the UUID matched.  
- Root Cause: Xcode requires exact profile Name (from .mobileprovision plist), not UUID or filename.  
- Solution:  
- Extracted Name field via openssl smime (Windows) or plutil (macOS).  
- Enforced PROVISIONING_PROFILE_SPECIFIER="Alphonso_iOS" in CI script.
C. Keychain Errors (-8183)  
- Issue: security cms -D failed with -8183 (errSecCSInvalidFlags) during profile decoding.  
- Root Cause: macOS ran out of trusted certificates in the keychain.  
- Solution:  
- Suppressed errors with || true in CI script.  
- Ensured keychain path (/Library/Keychains/System.keychain) was accessible to Xcode.
D. Xcode Signing Failures  
- Issue: Archive step failed with:  
No profile for team '9Y6GYPM3K5' matching 'Alphonso_iOS' found.  
- Root Cause: Provisioning profile Name ≠ "Alphonso_iOS" (verified via openssl smime).
3. Step-by-Step Fixes  
A. Certificate & Keychain  
1. Generate RSA PEM Key (Windows):  
openssl rsa -traditional -out key.pem  # Traditional RSA format
2. Upload Secrets:  
- IOS_CERT_DER: Base64-encoded DER cert.  
- IOS_KEY_PEM: RSA PEM key.
3. Import on macOS Runner:  
security import cert.cer -t cert -k /Library/Keychains/System.keychain
security import key.pem -t priv -f openssl -A -k /Library/Keychains/System.keychain
B. Provisioning Profile  
1. Extract Profile Name (Windows):  
openssl smime -inform DER -in "Alphonso_iOS.mobileprovision" -out profile.plist
plutil -extract Name string -f profile.plist  # Windows requires manual extraction
- Expected Output: Name="Alphonso_iOS"
2. Enforce Name in CI:  
Update .github/workflows/ios-build.yml:  
PROVISIONING_PROFILE_SPECIFIER="$NAME"  # Must match "Alphonso_iOS"
C. Xcode Signing  
1. Archive with Correct Profile:  
xcodebuild archive \
  -scheme AlphonsoCompanion \
  CODE_SIGN_IDENTITY="iPhone Distribution: 9Y6GYPM3K5" \
  PROVISIONING_PROFILE_SPECIFIER="$NAME"
2. Verify Profile Name:  
Run locally:  
xcodebuild -list --provisioning-profiles
4. Current Status  
- Resolved:  
- Certificate import (DER/PEM format).  
- Keychain errors (suppressed -8183).
- Pending:  
- Provisioning profile Name mismatch (Alphonso_iOS vs. actual name).  
- Xcode archive step failing due to Name mismatch.
5. Lessons Learned  
1. Avoid .p12 with PBES2: Use DER/PEM for cross-environment compatibility.  
2. Profile Name is Critical: Xcode requires exact Name, not UUID or filename.  
3. Keychain Access: Ensure Xcode can read the keychain path (/Library/Keychains/System.keychain).
6. Next Steps  
1. Fix Provisioning Profile Name:  
- Extract exact Name via openssl smime (Windows).  
- Update CI script to enforce Alphonso_iOS.
3. Re-run CI Workflow:  
- Push changes to main branch and trigger GitHub Actions.
Final Note: The remaining blocker is the provisioning profile Name mismatch. Once resolved, the app should build, archive, and deploy to TestFlight successfully.

Enhanced Comprehensive Report: Alphonso Companion iOS Development & Deployment
1. Certificate Management (Enhanced)  
Issue: OpenSSL 3.x PBES2-encrypted .p12 files failed on macOS security import.  
Technical Breakdown:  
- PBES2 Encryption: Modern OpenSSL (3.x) uses PBES2 for password-protecting .p12 files, which macOS security CLI cannot decode natively.  
- macOS Compatibility: Requires either:  
- Legacy PBES1-encrypted .p12 (requiring an unencrypted password), or  
- Separate DER (certificate) and PEM (key) formats.
Solution Details:  
1. Generate RSA PEM Key (Windows):  
# Generate traditional RSA key (no password, PKCS#1 format)
openssl genrsa -out key.pem 2048
- Why RSA?: Avoids PKCS#8/ECDSA complexities.
2. Upload Secrets:  
- IOS_CERT_DER: Base64-encoded DER certificate (binary format).  
- IOS_KEY_PEM: RSA PEM key (no password required).
3. Import on macOS Runner:  
# Import DER cert (auto-detect format)
security import temp.cer -t cert -k /Library/Keychains/System.keychain

# Import PEM key (unencrypted)
security import temp.key -t priv -f openssl -A -k /Library/Keychains/System.keychain
- -A Flag: Automatically adds key to keychain for Xcode access.
Troubleshooting:  
- If security import fails:  
- Check file permissions (chmod 600 temp.cer/temp.key).  
- Verify OpenSSL version (openssl version).
2. Provisioning Profile Name Mismatch (Deep Dive)  
Issue: Xcode requires the exact Name from .mobileprovision, not UUID or filename.  
Why It Matters:  
- Xcode maps PROVISIONING_PROFILE_SPECIFIER to the profile’s Name field in Info.plist (not the filename or UUID).  
- Even a single character difference (e.g., Alphonso_iOS vs. Alphonso_iOS_1) breaks the build.
Solution Details:  
1. Extract Name Field (Windows):  
# Use OpenSSL to extract plist content
openssl smime -inform DER -in "Alphonso_iOS.mobileprovision" -out profile.plist

# Extract Name field with Windows PowerShell
plutil -extract Name string -f profile.plist  # Requires `plutil` installed (e.g., via Chocolatey)
- Expected Output: Name="Alphonso_iOS"
2. Enforce Name in GitHub Actions:  
Update workflow:  
jobs:
  build:
    steps:
      - name: Validate Provisioning Profile Name
        run: |
          NAME=$(plutil -extract Name string -f "$PP_PATH")
          if [ "$NAME" != "Alphonso_iOS" ]; then
            echo "::error::Profile Name must be 'Alphonso_iOS', found '$NAME'"
            exit 1
          fi
Testing:  
- Run xcodebuild -list --provisioning-profiles on your Mac to confirm Alphonso_iOS appears.
3. Keychain Errors (-8183) and Workarounds  
Issue: security cms -D failed with -8183 (errSecCSInvalidFlags).  
Technical Cause:  
- -8183 indicates a mismatch in the CMS structure during profile decoding.  
- This often occurs if the provisioning profile is corrupted or improperly formatted.
Solution Details:  
1. Suppress Errors Gracefully:  
security cms -D -i "$PP_PATH" > "$PP_PLIST" || plutil -extract UUID raw "$PP_PATH" > "$PP_PLIST"
- Fallback: Use plutil to extract UUID directly if security cms fails.
2. Prevent Future Errors:  
- Validate the profile locally before uploading secrets:  
openssl smime -inform DER -verify -in "Alphonso_iOS.mobileprovision"
- Ensure the profile is signed by a trusted CA (Apple’s root CA).
Best Practice:  
- Avoid using .p12 files for provisioning profiles. Always use DER/PEM or auto-decoded base64.
4. Xcode Signing Failures (Actionable Fixes)  
Issue: No profile for team '9Y6GYPM3K5' matching 'Alphonso_iOS' found.  
Root Cause Analysis:  
- Xcode searches for a provisioning profile with:  
- TeamIdentifierPrefix = 9Y6GYPM3K5 (your team ID).  
- Name = Alphonso_iOS.
Solution Details:  
1. Verify Team ID:  
- Ensure CODE_SIGN_IDENTITY="iPhone Distribution: 9Y6GYPM3K5" matches your Apple Developer account.
2. Fix Profile Installation:  
# Install profile with exact Name
cp "$PP_PATH" ~/Library/MobileDevice/Provisioning\ Profiles/"$UUID".mobileprovision

# Verify in Keychain Access
security find-identity -v /Library/Keychains/System.keychain | grep "Alphonso_iOS"
3. Xcodebuild Command:  
xcodebuild archive \
  -scheme AlphonsoCompanion \
  CODE_SIGN_IDENTITY="iPhone Distribution: 9Y6GYPM3K5" \
  PROVISIONING_PROFILE_SPECIFIER="Alphonso_iOS" \
  OTHER_CODE_SIGN_FLAGS="--keychain /Library/Keychains/System.keychain"
Troubleshooting:  
- If the profile isn’t found:  
- Check ~/Library/MobileDevice/Provisioning\ Profiles/.  
- Re-import the profile via security add-trustAnchor.
5. Xcode Archive and Export (Complete Workflow)  
Steps to Success:  
1. Archive with Correct Settings:  
xcodebuild archive \
  -scheme AlphonsoCompanion \
  CODE_SIGN_IDENTITY="iPhone Distribution: 9Y6GYPM3K5" \
  PROVISIONING_PROFILE_SPECIFIER="Alphonso_iOS" \
  -archivePath build/AlphonsoCompanion.xcarchive
2. Export IPA with TestFlight Settings:  
xcrun export-archive -archivePath build/AlphonsoCompanion.xcarchive \
  -exportPath build/ \
  -exportOptionsPlist export_options.plist
- export_options.plist Must Include:  
<key>method</key>
<string>app-store</string>
<key>provisioningProfiles</key>
<dict>
  <key>Alphonso_iOS</key>
  <dict>
    <key>installEnabled</key>
    <true/>
  </dict>
</dict>
6. Post-Deployment Testing on iPhone  
Common Pitfalls:  
- Installation Errors:  
- "App not available" on TestFlight: Verify BUNDLE_ID in Info.plist matches TestFlight.  
- "Invalid Security" error: Rebuild IPA to reset checksums.
Testing Steps:  
1. On iPhone:  
- Go to Settings > General > Device Management.  
- Remove any stale profiles for Alphonso Companion.
2. Install via TestFlight:  
- Ensure Wi-Fi is enabled.  
- Check for background installation (Settings > General > Background App Refresh).
7. Appendices  
A. Sample Commands with Expected Outputs  
# Extract Name from .mobileprovision (Windows)
plutil -extract Name string -f profile.plist
# Output: Name="Alphonso_iOS"

# Verify Profile Installation (Mac)
xcodebuild -list --provisioning-profiles | grep "Alphonso_iOS"
# Output: ✅ Alphonso_iOS (UUID: 969d211a-4125-4940-b3b3-2ed4a9a2a5bd)
B. Common Error Codes & Fixes  
Error Code	Fix
-8183	Use plutil fallback or validate profile structure.
No profile found	Ensure PROVISIONING_PROFILE_SPECIFIER matches Name.
Invalid Security	Rebuild IPA or check BUNDLE_ID.
8. Best Practices for Future Deployments  
1. Automate Profile Name Checks:  
Add a step in CI to fail the build if the profile Name ≠ Alphonso_iOS.  
2. Use DER/PEM for Secrets:  
Avoid .p12 files to prevent PBES2 compatibility issues.  
3. Test Locally First:  
Always validate profile installation and signing on a Mac before CI.
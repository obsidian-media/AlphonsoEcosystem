# Build Verification Requirements

Every implementation agent must provide proof.

Required commands:
```bash
npm run build
npx tauri build
```

Required report:
1. Files changed
2. New files added
3. Commands run
4. Actual build output summary
5. Whether the app opens
6. Whether installer was created
7. Exact installer path
8. Remaining TODOs
9. Known bugs
10. What is real vs placeholder

Expected installer path:
```text
src-tauri/target/release/bundle/nsis/Alphonso_0.1.0_x64-setup.exe
```

Red flags:
- claimed success without terminal output
- invented paths
- Electron code
- Linux/macOS paths on Windows
- backend systems claimed when only UI placeholders exist

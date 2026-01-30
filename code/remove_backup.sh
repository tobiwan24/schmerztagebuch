# Lösche App_backup.tsx aus Git
git rm --cached src/App_backup.tsx 2>/dev/null || echo "Datei nicht in Git"
git add -A
git commit -m "Remove App_backup.tsx from git tracking"
git push origin main --force

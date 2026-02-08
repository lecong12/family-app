git add .
if ($args.Count -eq 0) {
    git commit -m "Cập nhật"
} else {
    git commit -m "$args"
}
git push origin main --force

# FPV Factory Tycoon — dev shortcuts
# Usage: make <target>

.PHONY: dev test android android-sync android-debug

dev:
	npm run dev

test:
	npm test

# Build → sync → deploy to connected Android device
android:
	npm run android

# Debug build with FPS counter → sync → deploy
android-debug:
	npm run android:debug

# Build → sync only (no deploy); open android/ in Android Studio manually
android-sync:
	npm run android:sync

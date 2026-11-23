# MauSOS – Personal Emergency Alert App

MauSOS is an Android app that lets someone in danger alert their trusted contacts with **one press or one shake**. When an alert goes out, each contact receives an SMS with the user's name, the time, their street address, a Google Maps link to their live location and a link to a photo of their surroundings.

Built for the **Mobile Application Development** module.

- **Team:** Jhamna Pranay and Nigel Stan Redy
- **Lecturer:** Mr Chris Bergue
- **Platform:** Android (React Native + Expo, with custom Kotlin modules)

---

## Features

| Feature | What it does |
|---|---|
| **Accounts** | Sign up, sign in, sign out and password reset with Firebase Authentication. The session is kept, so the SOS button is never behind a login screen. |
| **Emergency contacts** | Add, edit and delete up to 5 contacts, each with a relationship and a priority (1–5). Numbers are checked and stored in international format (+230 by default). |
| **SOS button** | Press and hold for 3 seconds, with vibration feedback, so a pocket tap can't trigger an alert. |
| **Countdown and cancel** | A 3–15 second countdown (5 by default) to cancel a false alarm. Cancelling deletes any photo already uploaded. |
| **Shake to alert** | Several strong shakes start the same countdown, for when the user can't look at the screen. Sensitivity: Low, Medium or High. |
| **Live location** | GPS fix during the countdown, with the street address; falls back to a recent saved position if no fix arrives within 10 seconds. |
| **Silent photo** | One photo taken during the countdown (no shutter sound), uploaded to Cloudinary, and its link included in the SMS. |
| **SMS alerts** | Sent silently in the background through a native Kotlin module. On phones that block this (such as some Samsung models), the messaging app opens with everything filled in, ready to send. |
| **Alert status** | Shows each step live (location, photo, SMS, saved) and the result for each contact, with buttons to call the first contact or send an "I'm safe" all-clear. |
| **Alert history** | The 50 most recent alerts with photo, address, map link and delivery details. Records can't be edited or deleted. |
| **Stealth mode** | Disguises the app as a working calculator, including its home-screen icon and name. An unlock code opens MauSOS; a separate duress code sends a silent alert while the calculator stays on screen. |
| **Settings** | Countdown length, photo on/off, front or back camera, shake sensitivity, stealth mode, permissions, profile and sign-out. Changes save automatically. |

---

## Tech stack

| Area | Technology |
|---|---|
| Framework | React Native, Expo SDK 57 (development build) |
| Language | JavaScript; Kotlin for native Android modules |
| Navigation | React Navigation (bottom tabs + stack) |
| Authentication | Firebase Authentication (email and password) |
| Database | Cloud Firestore with security rules |
| Photo storage | Cloudinary (unsigned upload preset) |
| Device features | expo-location, expo-camera, expo-sensors (accelerometer), expo-haptics, expo-sms, expo-secure-store |
| Native modules | `mausos-sms` (Android SmsManager), `mausos-icon` (launcher icon switch) |

---

## Project structure

```
mausos/
├── App.js                  # App entry point
├── app.json                # Expo configuration, permissions and plugins
├── firestore.rules         # Firestore security rules
├── modules/
│   ├── mausos-sms/         # Kotlin module: silent SMS with delivery confirmation
│   └── mausos-icon/        # Kotlin module + config plugin: calculator icon for stealth mode
└── src/
    ├── screens/            # Auth, Home (SOS, countdown, status), Contacts, History, Settings, Stealth
    ├── navigation/         # Root navigator and tab navigator
    ├── context/            # Shared state: auth, settings, contacts, stealth lock
    ├── services/           # Alert pipeline, SMS, location, media upload, shake detection, stealth
    └── utils/              # Theme (design tokens), validators, formatting, SHA-256
```

---

## Getting started

### Prerequisites

- Node.js (LTS) and npm
- Java 17 (JDK)
- Android SDK with platform tools (`adb`), and an Android phone or emulator (Android 11 or later recommended)

### Install and run (development)

```bash
npm install
npx expo run:android
```

This builds the development version, installs it on the connected phone or emulator, and starts Metro.

### Build a release APK

The `android/` folder is generated, so create it first:

```bash
npx expo prebuild --platform android
cd android
./gradlew app:assembleRelease "-PreactNativeArchitectures=arm64-v8a,x86_64"
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. Install it with:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

On Windows PowerShell, use `.\gradlew` instead of `./gradlew`, and keep the quotes around the architectures option.

---

## Permissions

| Permission | Why | If refused |
|---|---|---|
| Location (precise and approximate) | Exact position and map link in the alert | Alert is still sent, marked "location unavailable" |
| Camera | Photo of the surroundings during the countdown | Alert is sent without a photo |
| Send SMS | Silent sending in the background | The messaging app opens instead |
| Vibrate | Feedback during the hold and countdown | Granted automatically |

No microphone, contacts or start-on-boot permissions are requested.

---

## Security

- **Server-side rules:** each user can read and write only their own data.
- **Validation in two places:** input is checked in the app and again by the Firestore rules.
- **Tamper-proof history:** alerts can't be deleted; only their status can change, and a photo link can be added once.
- **No secrets in the app:** photos upload through an unsigned Cloudinary preset; the Firebase API key only identifies the project.
- **Hashed stealth codes:** unlock and duress codes are salted and hashed (SHA-256, 500 rounds) and stored only on the phone, in encrypted storage.
- **Privacy:** sign-in and password-reset messages never reveal whether an account exists.

---

## Testing

Tested on a **Samsung Galaxy A50** (physical device) and **Android emulators** (including Android 12). Verified flows include sign-in and session persistence, contacts, full alerts with location and photo link on a real phone, cancellation with photo deletion, shake detection, alert history, settings, stealth mode with the icon switch, and duress alerts.

---

## Known limitations

- **Android only:** iOS does not allow apps to send SMS without the user pressing Send, and shows a system message when an app changes its icon.
- **Silent SMS depends on the phone maker:** some manufacturers block background SMS; MauSOS then falls back to the messaging app.
- **Shake detection works while the app is open.**

---

## AI use disclosure

We used **Claude** (by Anthropic) as an AI coding assistant during this project. It helped us write and debug code (including the native Kotlin modules), troubleshoot problems we found while testing on our devices, and draft documentation.

The project idea, the choice of features and the design decisions were ours. We tested every feature on a physical Samsung Galaxy A50 and on Android emulators, found and reported the problems that needed fixing, and prepared and presented the demonstration ourselves.

---

## Team

| Member | Responsibilities |
|---|---|
| **Nigel Stan Redy** | Authentication, permissions, emergency contacts, SOS button, alert history |
| **Jhamna Pranay** | SOS countdown and shake trigger, alert screen, camera and Cloudinary upload, native SMS module, stealth mode |

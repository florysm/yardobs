plugins {
    id("com.android.application")
}

// The version comes from the web app's package.json, so the TV app and the
// site it wraps share a number.
val webVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootDir.resolve("../../package.json").readText())!!.groupValues[1]

android {
    namespace = "app.yardobs.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.yardobs.tv"
        minSdk = 23
        targetSdk = 35
        versionName = webVersion
        // 1.15.1 -> 11501. Must only go up, or Android refuses the update.
        versionCode = webVersion.split(".").map { it.toInt() }.let { (a, b, c) -> a * 10000 + b * 100 + c }
    }

    // A fixed debug key, committed on purpose: every CI build is signed the
    // same way, so a new APK installs over the old one (keeping the station
    // and key saved in the app) instead of failing with a signature mismatch.
    // It's a sideload-only debug key, not a Play Store key.
    signingConfigs {
        getByName("debug") {
            storeFile = file("yardobs-tv-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

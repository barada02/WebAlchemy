# Browser Application Setup Guide

Follow these steps to initialize your Electron SPA. I have already created the source files (`main.js`, `index.html`, etc.) in the `Browser` directory for you.

## Step 1: Navigate to the Directory
Open your terminal (PowerShell) and navigate to the newly created directory:
```powershell
cd c:\Users\barad\Desktop\projects\WebAlchemy\Browser
```

## Step 2: Initialize the Node Project
Create a default `package.json` file:
```powershell
npm init -y
```

## Step 3: Install Electron
Install Electron as a development dependency. This step might take a minute:
```powershell
npm install --save-dev electron
```

## Step 4: Update `package.json`
Open the `package.json` file inside the `Browser` directory. Update the `"main"` property and add a `"start"` script so it looks like this:

```json
{
  "name": "browser",
  "version": "1.0.0",
  "description": "",
  "main": "main.js", 
  "scripts": {
    "start": "electron ."
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "electron": "^[version]"
  }
}
```

## Step 5: Run the App!
Launch the minimal app:
```powershell
npm start
```

You should see a window pop up with "Browser Development Phase 1". Let me know once you verify it works!

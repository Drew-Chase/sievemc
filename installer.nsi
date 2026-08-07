!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Constants
!define APP_NAME "SieveMC"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "LFInteractive LLC."
!define APP_EXE "sievemc.exe"
!define CLI_EXE "sievemc_cli.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

; Per-user install — no elevation needed
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

Name "${APP_NAME} ${APP_VERSION}"
BrandingText "${APP_PUBLISHER}"

; VI Version Keys
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 ${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

; Install into current user's LocalAppData — no elevation needed
InstallDir "$LOCALAPPDATA\${APP_PUBLISHER}\${APP_NAME}"
OutFile "target\release\${APP_NAME}Setup.exe"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallPath"

;--------------------------------
; Interface
;--------------------------------
!define MUI_ABORTWARNING
!define MUI_ICON "crates\desktop\src-tauri\icons\icon.ico"
!define MUI_UNICON "crates\desktop\src-tauri\icons\icon.ico"

!define MUI_WELCOMEPAGE_TITLE "Welcome to the ${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${APP_NAME} ${APP_VERSION}.$\r$\n$\r$\n${APP_NAME} installs for the current user only, so no administrator privileges are required.$\r$\n$\r$\nClick Next to continue."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Setup will install ${APP_NAME} into the following folder. To choose a different folder, click Browse. Click Install to start the installation."

!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

; Installer pages: Welcome -> License -> Directory -> Install -> Finish (launch)
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Helpers
;--------------------------------

; Launch the app without inheriting the installer's token/priority.
Function LaunchApp
    ${If} ${FileExists} "$INSTDIR\${APP_EXE}"
        Exec '"$INSTDIR\${APP_EXE}"'
    ${EndIf}
FunctionEnd

; In silent mode (/S) the wizard pages are skipped by NSIS automatically, so the
; only thing that needs a manual equivalent is the finish-page "run" checkbox.
Function .onInstSuccess
    ${If} ${Silent}
        Call LaunchApp
    ${EndIf}
FunctionEnd

;--------------------------------
; Install
;--------------------------------
Section "Core Application" SecCore
    ; Kill any running instance before overwriting the binaries
    nsExec::Exec 'taskkill /F /IM ${APP_EXE}'
    Pop $0
    nsExec::Exec 'taskkill /F /IM ${CLI_EXE}'
    Pop $0

    SetOutPath "$INSTDIR"
    File "target\release\${APP_EXE}"
    File "target\release\${CLI_EXE}"
    ; Bundle VC++ runtime DLLs so the app runs without a separate redistributable install.
    ; The installer is a 32-bit process, so SysNative bypasses WOW64 redirection and
    ; yields the real 64-bit DLL.
    File "/oname=vcruntime140.dll" "$%SystemRoot%\SysNative\vcruntime140.dll"

    WriteUninstaller "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\${APP_NAME}" "InstallPath" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}" "$\"$INSTDIR\${APP_EXE}$\""

    ; Add/Remove Programs entry
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
    WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$\"$INSTDIR\${APP_EXE}$\""
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
    WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
    WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"

    ; Start menu shortcuts
    CreateDirectory "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}"
    CreateShortcut "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\${APP_NAME} Server.lnk" "$INSTDIR\${APP_EXE}"
    CreateShortcut "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\${APP_NAME} Configuration.lnk" "$INSTDIR\${CLI_EXE}"
    CreateShortcut "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"

    ; CLI launcher: a bin\ dir next to the binaries that gets added to PATH.
    ; %~dp0 keeps the shim valid regardless of where the user installed to.
    CreateDirectory "$INSTDIR\bin"
    FileOpen $0 "$INSTDIR\bin\sievemc.cmd" w
    FileWrite $0 "@echo off$\r$\n"
    FileWrite $0 '"%~dp0..\${CLI_EXE}" %*$\r$\n'
    FileClose $0

    ; Add bin directory to the user PATH.
    ; Requires the EnVar plugin: https://nsis.sourceforge.io/EnVar_plug-in
    EnVar::SetHKCU
    Pop $0
    EnVar::Check "Path" "$INSTDIR\bin"
    Pop $0
    ; 0 = already present; anything else means it needs adding
    ${If} $0 != 0
        EnVar::AddValue "Path" "$INSTDIR\bin"
        Pop $0
        ${If} $0 != 0
            DetailPrint "Warning: failed to add $INSTDIR\bin to PATH (code $0)"
        ${EndIf}
    ${EndIf}
SectionEnd

;--------------------------------
; Uninstall
;--------------------------------
Section "Uninstall"
    nsExec::Exec 'taskkill /F /IM ${APP_EXE}'
    Pop $0
    nsExec::Exec 'taskkill /F /IM ${CLI_EXE}'
    Pop $0

    ; Remove bin from PATH before the directory goes away
    EnVar::SetHKCU
    Pop $0
    EnVar::Check "Path" "$INSTDIR\bin"
    Pop $0
    ${If} $0 == 0
        EnVar::DeleteValue "Path" "$INSTDIR\bin"
        Pop $0
    ${EndIf}

    Delete "$INSTDIR\bin\sievemc.cmd"
    RMDir "$INSTDIR\bin"
    Delete "$INSTDIR\${APP_EXE}"
    Delete "$INSTDIR\${CLI_EXE}"
    Delete "$INSTDIR\vcruntime140.dll"
    Delete "$INSTDIR\uninstall.exe"
    RMDir /r "$INSTDIR"

    DeleteRegKey HKCU "Software\${APP_NAME}"
    DeleteRegKey HKCU "${UNINST_KEY}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"

    Delete "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\${APP_NAME} Server.lnk"
    Delete "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\${APP_NAME} Configuration.lnk"
    Delete "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
    RMDir "$SMPROGRAMS\${APP_PUBLISHER}\${APP_NAME}"
    RMDir "$SMPROGRAMS\${APP_PUBLISHER}"
SectionEnd

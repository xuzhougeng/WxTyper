#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef WebViewBootstrapper
  #error WebViewBootstrapper is required
#endif

[Setup]
AppId={{AA047FA2-67D1-445F-9FF5-F42CC8FFB812}
AppName=WxTyper
AppVersion={#AppVersion}
AppPublisher=xuzhougeng
AppPublisherURL=https://github.com/xuzhougeng/WxTyper
DefaultDirName={localappdata}\Programs\WxTyper
DefaultGroupName=WxTyper
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#OutputDir}
OutputBaseFilename=WxTyper-{#AppVersion}-Windows-x64-Setup
SetupIconFile={#SourceDir}\Assets\AppIcon.ico
UninstallDisplayIcon={app}\WxTyper.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#WebViewBootstrapper}"; Flags: dontcopy

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Icons]
Name: "{group}\WxTyper"; Filename: "{app}\WxTyper.exe"
Name: "{autodesktop}\WxTyper"; Filename: "{app}\WxTyper.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\WxTyper.exe"; Description: "Launch WxTyper"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKCU, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM64, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  if not HasWebView2 then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '',
      SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Result := 'Could not start the Microsoft WebView2 installer. Install WebView2 and try again.'
    else if not HasWebView2 then
      Result := 'Microsoft WebView2 installation failed. Check your internet connection or install the WebView2 Evergreen Runtime, then try again. Exit code: ' + IntToStr(ResultCode);
  end;
end;

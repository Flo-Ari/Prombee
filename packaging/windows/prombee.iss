#ifndef AppVersion
  #error AppVersion is required
#endif
[Setup]
AppId={{E7B57908-C881-4A19-BD64-25713CDCBF48}
AppName=Prombee
AppVersion={#AppVersion}
AppPublisher=Flo-Ari
AppPublisherURL=https://github.com/Flo-Ari/Prombee
DefaultDirName={userdocs}\Prombee
DefaultGroupName=Prombee
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.19045
OutputDir=..\..\dist\windows
OutputBaseFilename=Prombee-{#AppVersion}-Setup-x64
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\Prombee.exe
CloseApplications=yes
LicenseFile=..\..\LICENSE
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
[Dirs]
Name: "{app}\Prombee-data"; Flags: uninsneveruninstall
[Files]
Source: "..\..\dist\windows\Prombee.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\NOTICE"; DestDir: "{app}"; Flags: ignoreversion
Source: "InnoSetup-LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\Prombee"; Filename: "{app}\Prombee.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Prombee"; Filename: "{app}\Prombee.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\Prombee.exe"; Description: "{cm:LaunchProgram,Prombee}"; Flags: nowait postinstall skipifsilent

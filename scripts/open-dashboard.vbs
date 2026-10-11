Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "python ""D:\OmniRoute\scripts\ensure-omniroute.py"" --open", 0, False

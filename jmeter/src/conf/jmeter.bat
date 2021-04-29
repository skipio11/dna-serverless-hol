@echo off
setlocal

set "PATH=;%PATH%C:\Users\Administrator\Documents\java\jdk-11\bin"
set "JMETER_HOME=C:\Users\Administrator\Documents\jmeter\apache-jmeter-5.4.1"

echo %PATH%
cd %JMETER_HOME%
"%JMETER_HOME%\bin\jmeter.bat"
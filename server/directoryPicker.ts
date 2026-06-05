// @ts-nocheck
import { execFile, execFileSync } from "child_process";
import path from "path";

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 0, maxBuffer: 1024 * 1024, ...opts }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });

const commandExists = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const isCancel = (error) => {
  const text = `${error?.message || ""}\n${error?.stderr || ""}`;
  return /cancel|canceled|cancelled|用户取消/i.test(text);
};

const pickDirectory = async () => {
  try {
    if (process.platform === "darwin") {
      const picked = await run("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "选择工作区文件夹")',
      ]);
      return picked ? path.resolve(picked) : null;
    }

    if (process.platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        '$dialog.Description = "选择工作区文件夹"',
        "$dialog.ShowNewFolderButton = $false",
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
      ].join("; ");
      const picked = await run("powershell.exe", ["-NoProfile", "-Command", script]);
      return picked ? path.resolve(picked) : null;
    }

    if (commandExists("zenity")) {
      const picked = await run("zenity", ["--file-selection", "--directory", "--title=选择工作区文件夹"]);
      return picked ? path.resolve(picked) : null;
    }
    if (commandExists("kdialog")) {
      const picked = await run("kdialog", ["--getexistingdirectory", process.cwd(), "选择工作区文件夹"]);
      return picked ? path.resolve(picked) : null;
    }

    throw new Error("当前系统没有可用的目录选择器,请手动输入文件夹路径");
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
};

export { pickDirectory };

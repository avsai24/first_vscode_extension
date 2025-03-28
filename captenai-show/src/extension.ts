import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as os from 'os';
import { fetch } from 'undici';
import * as crypto from 'crypto';

// ✅ Secure this before publishing
const GEMINI_API_KEY = 'gemini-api-key';

async function getGitRoot(cwd: string): Promise<string> {
  const execPromise = util.promisify(exec);
  const { stdout } = await execPromise('git rev-parse --show-toplevel', { cwd });
  return stdout.trim();
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "captenai-show" is now active!');
  
	const diffDisposable = vscode.commands.registerCommand('extension.showDiff', async () => {
	  const editor = vscode.window.activeTextEditor;
	  if (!editor) {
		vscode.window.showErrorMessage('No active file open.');
		return;
	  }
  
	  const document = editor.document;
	  const filePath = document.uri.fsPath;
	  const execPromise = util.promisify(exec);
	  const gitRoot = await getGitRoot(path.dirname(filePath));
	  const relativePath = path.relative(gitRoot, filePath);
  
	  try {
		const { stdout } = await execPromise(`git show HEAD:${relativePath}`, { cwd: gitRoot });
		const currentContent = document.getText();
  
		if (stdout.trim() === currentContent.trim()) {
		  vscode.window.showInformationMessage('No changes detected – the file is identical to the last commit.');
		  return;
		}
  
		const parsedPath = path.parse(filePath);
		const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
		const tempFileName = `${parsedPath.name}__showdiff_${fileHash}${parsedPath.ext}`;
		const tempFilePath = path.join(os.tmpdir(), tempFileName);
		
		fs.writeFileSync(tempFilePath, stdout);
  
		const oldFileUri = vscode.Uri.file(tempFilePath);
		const newFileUri = document.uri;
  
		await vscode.commands.executeCommand('vscode.diff', oldFileUri, newFileUri,  `CaptenAI Diff: ${parsedPath.base}`, {
		  viewColumn: vscode.ViewColumn.Beside
		});
  
	  } catch (error: any) {
		vscode.window.showErrorMessage(`Failed to load previous version: ${error.message}`);
	  }
	});
  
	const aiDisposable = vscode.commands.registerCommand('extension.askAI', async () => {
	  const editor = vscode.window.activeTextEditor;
	  if (!editor) {
		vscode.window.showErrorMessage('No file open.');
		return;
	  }

    const code = editor.document.getText();
	const prompt = `
		You are a senior software engineer reviewing the following code.

		Return your feedback as clearly structured bullet points in Markdown format.

		Group your suggestions into the following sections:
		1. Code Quality
		2. Potential Bugs
		3. Optimization Tips
		4. Security or API usage issues
		5. Overall Suggestions

		Here is the code to review:

		\`\`\`ts
		${code}
		\`\`\`
		`;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          }),
        }
      );

      const data = await response.json() as any;
      const suggestion = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (suggestion) {
        const html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: sans-serif;
                padding: 1rem;
                line-height: 1.6;
                background: #ffffff;
                color: #333;
              }
              h2 {
                margin-top: 0;
              }
              pre {
                background: #f4f4f4;
                padding: 10px;
                border-radius: 6px;
                overflow-x: auto;
              }
            </style>
            <title>AI Suggestion</title>
          </head>
          <body>
            <h2>💡 Gemini Code Suggestions</h2>
            <div>${suggestion.replace(/\n/g, '<br/>')}</div>
          </body>
          </html>
        `;
        showOrUpdateWebview('AI Code Suggestions', html);
      } else {
        vscode.window.showErrorMessage('No suggestion returned from CaptenAI');
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Gemini API Error: ${error.message}`);
    }
  });

  const showDiffButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  showDiffButton.text = '$(diff) Show Diff';
  showDiffButton.tooltip = 'Compare with last Git commit';
  showDiffButton.command = 'extension.showDiff';
  showDiffButton.show();

  const aiButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  aiButton.text = '$(sparkle) Code Suggestion';
  aiButton.tooltip = 'Ask AI for code improvement suggestions';
  aiButton.command = 'extension.askAI';
  aiButton.show();

  context.subscriptions.push(diffDisposable, aiDisposable, showDiffButton, aiButton);
}

export function deactivate() {}

let suggestionPanel: vscode.WebviewPanel | undefined = undefined;

function showOrUpdateWebview(title: string, htmlContent: string) {
  if (suggestionPanel) {
    suggestionPanel.webview.html = htmlContent;
    suggestionPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    suggestionPanel = vscode.window.createWebviewPanel(
      'captenaiSuggestions',
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    suggestionPanel.webview.html = htmlContent;

    suggestionPanel.onDidDispose(() => {
      suggestionPanel = undefined;
    });
  }
}

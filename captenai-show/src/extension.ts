import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

export function activate(context: vscode.ExtensionContext) {

	
	console.log('Congratulations, your extension "captenai-show" is now active!');

	
	let disposable = vscode.commands.registerCommand('extension.showDiff', async () => {
		let editor = vscode.window.activeTextEditor;
	  
		if (!editor) {
		  vscode.window.showErrorMessage('No active file open.');
		  return;
		}
	  
		let document = editor.document;
		let filePath = document.uri.fsPath;
	  
		const execPromise = util.promisify(exec);
	  
		// Convert to Git-relative path
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		if (!workspaceFolder) {
		  vscode.window.showErrorMessage('Could not find workspace folder.');
		  return;
		}
	  
		const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
	  
		try {
		  const { stdout } = await execPromise(`git show HEAD:${relativePath}`, {
			cwd: workspaceFolder.uri.fsPath,
		  });
	  
		  vscode.window.showInformationMessage('Loaded previous version from Git!');
		  console.log(stdout); // Preview old version in debug console
	  
		} catch (error: any) {
		  vscode.window.showErrorMessage(`Failed to load previous version: ${error.message}`);
		}
	  
		vscode.window.showInformationMessage(`Current file path: ${filePath}`);
	  });

	context.subscriptions.push(disposable);
}


export function deactivate() {}

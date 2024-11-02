"use strict";
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { optimize } = require('svgo');

function activate(context) {
	const appDir = path.join((require.main ? path.dirname(require.main.filename) : globalThis._VSCODE_FILE_ROOT), "media");
	const extDir = path.join(context.extensionPath, "media");
	if (!appDir) {
		vscode.window.showInformationMessage("Unable to locate the installation path of VSCode.");
		return;
	}
	backupDefaultLetterpress(extDir, appDir);
	const change = vscode.commands.registerCommand('letterpress-customer.changeletterpress', function () {
		const items = [{label:"Monochrome"}, {label:"Color"}, {kind:vscode.QuickPickItemKind.Separator},{label:"Set default"}];
		const quickPick =vscode.window.createQuickPick();
		quickPick.items = items;
		quickPick.placeholder = "Select type of letterpress";
		quickPick.show();
		quickPick.onDidAccept( () => {
			const selection = quickPick.selectedItems[0].label;
			quickPick.hide();
			if (!selection) {
				vscode.window.showInformationMessage("No selection made");
				return;
			}
			let variables = [];
			if (selection === "Monochrome"){
				variables = resort(fs.readdirSync(path.join(extDir, "monochrome"), {withFileTypes: true}).filter(dirent => dirent.isDirectory()).map(dirent => toUpper(dirent.name)));
			} else if (selection === "Color"){
				variables = resort(fs.readdirSync(path.join(extDir, "color"), {withFileTypes: true}).filter(dirent => dirent.isDirectory()).map(dirent => toUpper(dirent.name)));
			} else{
				changeletterpress(appDir, extDir, "default");
				return;
			}
			const vars = variables.map(label => ({label}));
			const quickPick1 =vscode.window.createQuickPick();
			quickPick1.items = vars;
			quickPick1.show();
			quickPick1.onDidAccept(() => {
				const sel = quickPick1.selectedItems[0].label;
				quickPick1.placeholder = "Select letterpress";
				quickPick1.hide();
				if (sel){
					changeletterpress(appDir, extDir, selection, sel);
				}
			});
		});
	});
		
	const add = vscode.commands.registerCommand('letterpress-customer.addletterpress', function () {
		const items = [{label:"Monochrome"}, {label:"Color"}];
		const quickPick =vscode.window.createQuickPick();
		quickPick.items = items;
		quickPick.placeholder = "Select type of new letterpress";
		quickPick.show();
		quickPick.onDidAccept( () => {
			const selection = quickPick.selectedItems[0].label;
			quickPick.hide();
			if (!selection) {
				vscode.window.showInformationMessage("No selection made");
				return;
			}
			vscode.window.showInputBox({prompt: "Enter name of new letterpress.", placeHolder: "name"}).then(name => {
				if (!name){
					vscode.window.showInformationMessage("Enter name of new letterpress.");
					return;
				}
				name = toUpper(name.replace(/[\\/:"*?<>/|]+/g, " "));
				if (name === "con" || name === "aux" || name === "nul"){
					vscode.window.showInformationMessage("Uncorrect name for windows folder.");
				}
				let datas = {};
				["Dark", "HcDark", "Light", "HcLight"].reduce((promise, Ltype) => {
					return promise.then( () => {
						return SelectFile(Ltype).then(data => {
							if (!data){
								return;
							}
							datas["letterpress-" + Ltype + ".svg"] = data;
						});
					});
				}, Promise.resolve()).then( () => {
					if (Object.keys(datas).length === 4){createNewLetterpress(extDir, selection, name, datas);}
				}).catch((error) => {
					vscode.window.showErrorMessage("Error in ", error);
				});
			});
		});
	});

	context.subscriptions.push(change);
	context.subscriptions.push(add);
}

function backupDefaultLetterpress(extDir, appDir){
	const tar = path.join(extDir, "default");
	if (!fs.existsSync(tar)){
		fs.mkdirSync(tar, {recursive:true});
		fs.readdirSync(appDir).forEach(file => {
			if (file.includes("letterpress")){
				let sourceF = path.join(appDir, file);
				let tarF = path.join(tar, file);
				fs.copyFileSync(sourceF, tarF);
			}
		});
	}
}

function changeletterpress(appDir, extDir, type, name = "") {
	const source = path.join(extDir, type, name);
	const letterpresses = fs.readdirSync(source);
	letterpresses.forEach( file => {
		let sourcepath = path.join(source, file);
		let targetpath = path.join(appDir, file);
		fs.copyFileSync(sourcepath, targetpath);
	});
	if (vscode.workspace.getConfiguration("letterpress-customer").get("reopenNow")){
		vscode.commands.executeCommand("workbench.action.files.saveFiles").then(() => {
			vscode.commands.executeCommand("workbench.action.duplicateWorkspaceInNewWindow").then(() => {
				vscode.commands.executeCommand("workbench.action.closeWindow");
			}); 
		}); 
	} else {
		vscode.window.showInformationMessage("Reopen window for changes");
	}
}

function resort(array){
	return array.sort((a,b) => {
		const aCont = a.toLowerCase().includes("code") || a.toLowerCase().includes("codium");
		const bCont = b.toLowerCase().includes("code") || b.toLowerCase().includes("codium");
		if (aCont && !bCont){
			return -1;
		}
		if (!aCont && bCont){
			return 1;
		}
		return 0;
	});
}

function SelectFile(Type){
	return vscode.window.showOpenDialog({openLabel:Type,filters: {"Svg files": ["svg"]}, canSelectFiles: true, canSelectMany:false, canSelectFolders:false}).then(fileUri => {
		if (fileUri){
			if (fileUri.length > 0){fileUri=fileUri[0];}
			try{
				const file = fileUri.fsPath;
				const content = fs.readFileSync(file, "utf8");
				let res = optimize(content);
				return res.data;
			} catch {
				vscode.window.showInformationMessage("File is corrupt." + res.error);
				return null;
			}
		} else {
			vscode.window.showInformationMessage("No file selected.");
			return null;
		}
	});
}

function createNewLetterpress(extDir, Type, name, datas){
	const tar = path.join(extDir, Type, name);
	if (!fs.existsSync(tar)){
		fs.mkdirSync(tar, {recursive:true});
	}
	Object.entries(datas).forEach(([filename, data]) => {
		let filePath = path.join(tar, filename);
		fs.writeFile(filePath, data, (err) => {
			if (err){
				vscode.window.showWarningMessage(`Write error in file ${filename}`, err);
			}
		});
	});
}

function toUpper(name){
	return name.charAt(0).toUpperCase() + name.slice(1);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}

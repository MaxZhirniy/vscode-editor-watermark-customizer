"use strict";
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { optimize } = require('./svgo-mini.js');

function activate(context) {
	const appDir = (require.main ? path.dirname(require.main.filename) : globalThis._VSCODE_FILE_ROOT);
	const extDir = path.join(context.extensionPath, "media");
	const safelyMode = vscode.workspace.getConfiguration("editor-watermark-customizer").get("safelyMode");
	if (!appDir) {
		vscode.window.showInformationMessage("Unable to locate the installation path of VSCode.");
		return;
	}
	const mediaDir = path.join(appDir, "media");
	if (!safelyMode){
		const tar = path.join(extDir, "default");
		fs.access(tar, fs.constants.F_OK, (err)=>{
			if (err){
				fs.mkdir(tar, {recursive:true}, (mkdirErr) => {
					if (mkdirErr){
						vscode.window.showWarningMessage("Error in create backup directory: " + mkdirErr);
						return;
					}
					fs.readdir(mediaDir, "utf8", (err, files) =>{
						if (err){
							vscode.window.showErrorMessage("Backup error: " + err);
							return;
						}
						files.forEach(file => {
							if (file.includes("letterpress")){
								let sourceFile = path.join(mediaDir, file);
								let targetFile = path.join(tar, file);
								fs.copyFile(sourceFile, targetFile,fs.constants.COPYFILE_EXCL, (err) =>{
									if (err){
										vscode.window.showWarningMessage("Error in backup files: " + err);
										return;
									}
								});
							}
						});
					});
				});
			}
		});
	}
	
	function changeLetterpress(type, name = "") {
		const source = path.join(extDir, type, name);
		fs.readdir(source, "utf8", (readErr, files) => {
			if (readErr){
				vscode.window.showWarningMessage("Error: " + readErr);
				return;
			}
			let inj = {};
			let multi = true;
			if (files.length === 1){multi=false}
			if (!safelyMode){
				const oldFiles = fs.readdirSync(mediaDir);
				oldFiles.forEach((oldFile) => {
					try {
						if (oldFile.includes("letterpress")){
							fs.unlinkSync(path.join(mediaDir, oldFile));
						}
					} catch (err){
						vscode.window.showErrorMessage("Error with deleting old watermark:" + oldFile +"\nUse safely mode or restart vscode as admin");
					}
				})
			}
			files.forEach( file => {
				if (!safelyMode){
					if (multi) { 
						inj[file.match(/^letterpress-(.*?)\./)[1].toLowerCase()] = file;
					} else {
						inj["light"] = file;
						inj["dark"] = file;
						inj["hcdark"] = file;
						inj["hclight"] = file;
					}
					const sourcepath = path.join(source, file);
					const targetpath = path.join(mediaDir, file);
					fs.copyFileSync(sourcepath, targetpath);
				} else{
					if (multi) { 
						inj[file.match(/^letterpress-(.*?)\./)[1].toLowerCase()] = path.join(source, file);
						console.log(file.match(/^letterpress-(.*?)\./)[1].toLowerCase());
					} else {
						inj["light"] = path.join(source, file);
						inj["dark"] = path.join(source, file);
						inj["hcdark"] = path.join(source, file);
						inj["hclight"] = path.join(source, file);
					}
				}
			});
			injectToWorkbenchHtml(inj, name);
			if (vscode.workspace.getConfiguration("editor-watermark-customizer").get("reopenNow")){
				vscode.commands.executeCommand("workbench.action.files.saveFiles").then( () => {
					vscode.commands.executeCommand("workbench.action.duplicateWorkspaceInNewWindow").then( () => {
						vscode.commands.executeCommand("workbench.action.closeWindow");
					}); 
				}); 
			} else {
				vscode.window.showInformationMessage("Reopen window for changes");
			}
		});
	}

	function getInjection(watermarks){
		if (!safelyMode){
			return `<!--editor-watermark-customizer injection start--><style>` +
			`.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark > .letterpress {background-image: url(../../../../media/${watermarks["light"]}) !important;} ` + 
			`.monaco-workbench.vs-dark .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url(../../../../media/${watermarks["dark"]}) !important;} ` +
			`.monaco-workbench.hc-light .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url(../../../../media/${watermarks["hclight"]}) !important;} ` +
			`.monaco-workbench.hc-black .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url(../../../../media/${watermarks["hcdark"]}) !important;}` + 
			`</style><!--editor-watermark-customizer injection end-->\n`;
		} else {
			return `<!--editor-watermark-customizer injection start--><style>` +
			`.monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark > .letterpress {background-image: url("${watermarks["light"]}") !important;} ` + 
			`.monaco-workbench.vs-dark .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url("${watermarks["dark"]}") !important;} ` +
			`.monaco-workbench.hc-light .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url("${watermarks["hclight"]}") !important;} ` +
			`.monaco-workbench.hc-black .part.editor > .content .editor-group-container .editor-group-watermark > .letterpress {background-image: url("${watermarks["hcdark"]}") !important;}` + 
			`</style><!--editor-watermark-customizer injection end-->\n`;
		}
	}

	function removeChecksums(){
		const productDir = path.resolve(appDir, "..");
		const productPath = path.join(productDir, "product.json");
		fs.readFile(productPath, "utf8", (err, data)=>{
			if (err){
				vscode.window.showErrorMessage("Error: "+ err);
				return;
			}
			try{
				let jsonObj = JSON.parse(data);
				if (jsonObj["checksums"]){
					if (jsonObj["checksums"]["vs/workbench/workbench.desktop.main.css"]){
						delete jsonObj["checksums"]["vs/workbench/workbench.desktop.main.css"];
					}
					if (jsonObj["checksums"]["vs/code/electron-sandbox/workbench/workbench.esm.html"]) {
						delete jsonObj["checksums"]["vs/code/electron-sandbox/workbench/workbench.esm.html"];
					}
					if (jsonObj["checksums"]["vs/code/electron-sandbox/workbench/workbench.html"]) {
						delete jsonObj["checksums"]["vs/code/electron-sandbox/workbench/workbench.html"];
					}
				}
				const jsonStr = JSON.stringify(jsonObj, null, 4);
				fs.writeFile(productPath, jsonStr, "utf8", (err)=>{
					if (err){
						vscode.window.showErrorMessage("Error: "+ err);
						return;
					}
				});
			} catch (parseError){
				vscode.window.showErrorMessage("Error: "+ parseError);
				return;
			}
		});
	}

	function injectToWorkbenchHtml(injOpts, mode=""){
		let htmlFile = path.join(appDir, "vs", "code", "electron-sandbox", "workbench", "workbench.html");
		if (!fs.existsSync(htmlFile)) {
			htmlFile = path.join(appDir, "vs", "code", "electron-sandbox", "workbench", "workbench.esm.html");
			if (!fs.existsSync(htmlFile)) {htmlFile = path.join(appDir, "vs", "code", "electron-sandbox", "workbench", "electron-sandbox", "workbench", "workbench.esm.html");}
		}
		const BackupFilePath = path.join(path.dirname(htmlFile), "workbench.backup-editor-watermark-cutomizer");
		if (!fs.existsSync(BackupFilePath)){
			removeChecksums();
			fs.copyFile(htmlFile, BackupFilePath,fs.constants.COPYFILE_EXCL, (err)=>{
				if (err){
					vscode.window.showErrorMessage("Error in patching. Please, use only svg images for watermark and turn off safelyMode.\n" + err);
					return;
				}
			});
		}
		for (let Type in injOpts){
			if (!injOpts[Type].includes("/") && !injOpts[Type].includes("\\")){break;}
			let newPath = relativePath(htmlFile, injOpts[Type]);
			injOpts[Type] = newPath;
		}
		const injection = Boolean(mode) ? getInjection(injOpts) : "";
		fs.readFile(htmlFile, "utf8", (err, data)=>{
			if (err){
				vscode.window.showErrorMessage("Error in patching. Please, use only svg images for watermark and turn off safelyMode.\n" + err)
			}
			data = data.replace(/<!--editor-watermark-customizer injection start-->[\s\S].*?<!--editor-watermark-customizer injection end-->\n*/,""); 
			data =  data.replace(/(<\/html>)/,`${injection}</html>`);
			fs.writeFileSync(htmlFile, data, "utf8");
		});
	}

	function relativePath(dist, src){
		dist = dist.replace(/\\/g, "/"); src = src.replace(/\\/g, "/");
		const onDrive = (dist[0].toLowerCase()!==src[0].toLowerCase());
		let res = "";
		if (!onDrive){
			return (path.relative(path.dirname(dist), src).replace(":", "%3A")).replace(/\\/g, "/");
		}
		for (let d of dist.split('/')){
			res += "../";
		}
		return res+src.replace(":", "%3A");
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
		return vscode.window.showOpenDialog({
				openLabel:Type,
				filters: {"image files": ["svg", "png", "gif", "mp4", "jpg", "jpeg"]},
				canSelectFiles: true, 
				canSelectMany:false, 
				canSelectFolders:false
		}).then(fileUri => {
			return (fileUri.length > 0) ? fileUri[0].fsPath : fileUri.fsPath;
		});
	}

	function createNewWatermark(Type, name, paths){
		const vals = Object.values(paths); 
		const dist = path.join(extDir, Type, name);
		if (!fs.existsSync(dist)){
			fs.mkdirSync(dist, {recursive:true}); 
		}
		Object.entries(paths).forEach(([theme, file]) => {
			let filePath = "";
			if (path.extname(file).toLowerCase() === ".svg"){
				filePath = path.join(dist, ((vals.every(val => val===vals[0])) ? "letterpress-universal.svg": `letterpress-${theme}.svg`));
				const content = fs.readFileSync(file, "utf8");
				try{
					const res = optimize(content);
					fs.writeFileSync(filePath, res.data);
				} catch {
					vscode.window.showInformationMessage("File is corrupt." + res.error);
					return;
				}
				if (filePath.includes("universal")){return;}
			} else {
				filePath = path.join(dist, (vals.every(val => val===vals[0])) ? `letterpress-universal${path.extname(file)}`: `letterpress-${theme}${path.extname(file)}`);
				fs.copyFileSync(file, filePath);
				if (filePath.includes("universal")){return;}
			}
		});
		vscode.window.showInformationMessage(`Done! Watermark created. You can set it: "Change editor watermark" and select ${Type}, ${name}`);
	}

	function toUpper(name){
		return name.charAt(0).toUpperCase() + name.slice(1);
	}
	
	const change = vscode.commands.registerCommand('editor-watermark-customizer.changeEditorWatermark', function () {
		const items = [{label:"Monochrome"}, {label:"Color"}, {kind:vscode.QuickPickItemKind.Separator},{label:"Set default"}];
		const quickPick =vscode.window.createQuickPick();
		quickPick.items = items;
		quickPick.placeholder = "Select type of watermark";
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
				changeLetterpress("default");
				return;
			}
			const vars = variables.map(label => ({label}));
			const quickPick1 =vscode.window.createQuickPick();
			quickPick1.items = vars;
			quickPick1.show();
			quickPick1.onDidAccept(() => {
				const sel = quickPick1.selectedItems[0].label;
				quickPick1.placeholder = "Select watermark";
				quickPick1.hide();
				if (sel){
					changeLetterpress(selection, sel);
				}
			});
		});
	});
		
	const add = vscode.commands.registerCommand('editor-watermark-customizer.addwatermark', function () {
		const items = [{label:"Monochrome"}, {label:"Color"}];
		const quickPick = vscode.window.createQuickPick();
		quickPick.items = items;
		quickPick.placeholder = "Select type of new watermark";
		quickPick.show();
		quickPick.onDidAccept( () => {
			const selection = quickPick.selectedItems[0].label;
			quickPick.hide();
			if (!selection) {
				vscode.window.showInformationMessage("No selection made");
				return;
			}
			vscode.window.showInputBox({prompt: "Enter name of new watermark.", placeHolder: "name"}).then(name => {
				if (!name){
					vscode.window.showInformationMessage("Enter name of new watermark.");
					return;
				}
				name = toUpper(name.replace(/[\\/:"*?<>/|]+/g, " "));
				if (name === "con" || name === "aux" || name === "nul"){
					vscode.window.showInformationMessage("Uncorrect name for windows folder.");
				}
				const quickPick1 = vscode.window.createQuickPick();
				quickPick1.placeholder = "Select a style of new watermark";
				quickPick1.items = [{label: "Universal", description:  "(one file for all themes)"}, {label: "Multiple", description: "(any files per themes: light, dark, High contrast light and dark)"}];
				quickPick1.show();
				quickPick1.onDidAccept( () => {
					const style = quickPick1.selectedItems[0].label;
					quickPick1.hide();
					let paths = {};
					if (style === "Multiple"){
						["Dark", "HcDark", "Light", "HcLight"].reduce((promise, Ltype) => {
							return promise.then( () => {
								return SelectFile(Ltype).then(path => {
									if (!path){
										return;
									}
									paths[Ltype] = path;
								});
							});
						}, Promise.resolve()).then( () => {
							if (Object.keys(paths).length === 4){createNewWatermark(selection, name, paths);}
						}).catch((error) => {
							vscode.window.showErrorMessage("Error: \n" + error);
						});
					} else {
						SelectFile("Universal").then(path => {
							if (!path){
								return;
							}
							paths = ["Dark", "HcDark", "Light", "HcLight"].reduce((obj, Ltype) => {
								obj[Ltype] = path;
								return obj
							}, {});
							if (Object.keys(paths).length === 4){createNewWatermark(selection, name, paths);}
						});
					}
				});
			});
		});
	});
	context.subscriptions.push(change);
	context.subscriptions.push(add);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}

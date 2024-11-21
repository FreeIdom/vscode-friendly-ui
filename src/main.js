const vscode = require('vscode')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')

const rootPath = vscode.env.appRoot
const appPath = path.join(rootPath, "out")
const productFile = path.join(rootPath, 'product.json')
const productOrigFile = `${productFile}.orig.${vscode.version}`
// Workbench
const wbDir = 'vs/code/electron-sandbox/workbench/'
const wbHtmlDir = wbDir + 'workbench.html'
const wbHtmlFile = path.join(appPath, wbHtmlDir)
const wbHtmlOrigFile = `${wbHtmlFile}.orig.${vscode.version}`
const customCssFile = path.join(appPath, wbDir, "custom.css")
const customJsFile = path.join(appPath, wbDir, "custom.js")
const loaderJsFile = path.join(appPath, wbDir, "loader.js")

// Injection markers
const injectStart = '<!-- FriendlyUI -->'
const injectEnd = '<!-- End FriendlyUI -->'

// Configuration keys
const configIdentifer = 'friendly-ui'
const configCustomCssPath = 'customCssPath'
const configCustomJsPath = 'customJsPath'

const getProduct = () => {
    delete require.cache[require.resolve(productFile)]
    return require(productFile)
}

const computeChecksum = (file) => {
    const contents = fs.readFileSync(file)
    return crypto
        .createHash('sha256')
        .update(contents)
        .digest('base64')
        .replace(/=+$/, '')
}

const injectCustomStyle = (css, js, encoding = 'utf8') => {
    const loaderContent = `(function() {
        var t = new Date().getTime();
        ${css ? `var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './custom.css?' + t;
        document.head.appendChild(link);` : ''}
        ${js ? `var script = document.createElement('script');
        script.src = './custom.js?' + t;
        document.body.appendChild(script);` : ''}
    })();`
    fs.writeFileSync(loaderJsFile, loaderContent)

    const contents = fs.readFileSync(wbHtmlFile, encoding)
    const injectHtml = `${injectStart}\n<script src="./loader.js"></script>\n${injectEnd}`

    const regex = new RegExp(`${injectStart}[\\s\\S]*${injectEnd}`)
    const hasInjected = regex.test(contents)

    const newContents = hasInjected
        ? contents.replace(regex, injectHtml)
        : contents.replace('</html>', `${injectHtml}\n</html>`)

    fs.writeFileSync(wbHtmlFile, newContents)
}

const backupFile = (file, origFile) => {
    if (!fs.existsSync(origFile)) {
        fs.copyFileSync(file, origFile)
    }
}

const getUserCustomPath = () => {
    const config = vscode.workspace.getConfiguration(configIdentifer)
    const homedir = os.homedir()
    let cssPath = config.get(configCustomCssPath)
    let jsPath = config.get(configCustomJsPath)

    // Replace ~ with user's home directory
    cssPath = cssPath && cssPath.replace('~', homedir)
    jsPath = jsPath && jsPath.replace('~', homedir)

    // Validate paths exist
    cssPath = cssPath && fs.existsSync(cssPath) ? cssPath : null
    jsPath = jsPath && fs.existsSync(jsPath) ? jsPath : null

    return [cssPath, jsPath]
}

// Restore original files and clean up custom files
const restoreFiles = () => {
    if (fs.existsSync(wbHtmlOrigFile)) {
        fs.copyFileSync(wbHtmlOrigFile, wbHtmlFile)
        fs.unlinkSync(wbHtmlOrigFile)
    }
    if (fs.existsSync(productOrigFile)) {
        fs.copyFileSync(productOrigFile, productFile)
        fs.unlinkSync(productOrigFile)
    }
    fs.existsSync(customCssFile) && fs.unlinkSync(customCssFile)
    fs.existsSync(customJsFile) && fs.unlinkSync(customJsFile)
    fs.existsSync(loaderJsFile) && fs.unlinkSync(loaderJsFile)
}

function enable() {
    const product = getProduct()
    const [cssFilePath, jsFilePath] = getUserCustomPath()

    if (!cssFilePath && !jsFilePath) {
        return vscode.window.showErrorMessage('User custom css or js file not found, please config them in settings')
    }

    try {
        // Backup original files
        backupFile(wbHtmlFile, wbHtmlOrigFile)
        backupFile(productFile, productOrigFile)

        // Copy custom files
        cssFilePath && fs.copyFileSync(cssFilePath, customCssFile)
        jsFilePath && fs.copyFileSync(jsFilePath, customJsFile)

        // Inject custom styles
        injectCustomStyle(!!cssFilePath, !!jsFilePath)

        // Update checksum
        const wbChecksum = computeChecksum(wbHtmlFile)
        if (product.checksums[wbHtmlDir] !== wbChecksum) {
            product.checksums[wbHtmlDir] = wbChecksum
            fs.writeFileSync(productFile, JSON.stringify(product, null, '\t'))
            vscode.window.showInformationMessage(
                'FriendlyUI enabled for the first time. \nPlease manually restart VSCode to take effect.', 'OK'
            ).then(() => vscode.commands.executeCommand('workbench.action.reloadWindow'))
        } else {
            vscode.window.showInformationMessage('FriendlyUI enabled')
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to enable FriendlyUI: ${error.message}`)
        restoreFiles()
    }
}

function disable() {
    try {
        restoreFiles()
        vscode.window.showInformationMessage(
            'FriendlyUI disabled', 'Reload'
        ).then(() => vscode.commands.executeCommand('workbench.action.reloadWindow'))
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to disable FriendlyUI: ${error.message}`)
    }
}

function reload() {
    if (fs.existsSync(loaderJsFile)) {
        const [cssFilePath, jsFilePath] = getUserCustomPath()
        cssFilePath && fs.copyFileSync(cssFilePath, customCssFile)
        jsFilePath && fs.copyFileSync(jsFilePath, customJsFile)
        vscode.commands.executeCommand('workbench.action.reloadWindow')
    }
}

function activate(context) {
    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('friendly-ui.enable', enable),
        vscode.commands.registerCommand('friendly-ui.disable', disable),
        vscode.commands.registerCommand('friendly-ui.reload', reload)
    )
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
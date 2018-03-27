
const {createServer} = require("http");
const {parse} = require("url");
const {resolve} = require("path");
const {sep} = require("path");
const {createReadStream, mkdirSync, createWriteStream,
       statSync, readFileSync, writeFileSync} = require("fs");
const {stat, readdir, unlink} = require("mz/fs");
const mime = require("mime");

class PageEditorSettings{
    constructor(){
        this.path = "." + sep + "page_editor" + sep;
        this.pathTemplatePages = this.path + "template_page" + sep;
        this.pathUserPages = this.path + "user_pages" + sep;

        this.templatePageHtml = "start.html";
        this.templatePageCss = "start.css";
        this.templatePageJs = "start.js";

        this.RestoreCmd = "pageEditor_restore";
        this.CreateCmd = "pageEditor_create";
    }
    get getPath() { return this.path; }
    get getPathTemplatePages() { return this.pathTemplatePages; }
    get getPathUserPages() { return this.pathUserPages };
    get getTemplatePageHtml() { return this.templatePageHtml; }
    get getTemplatePageCss() { return this.templatePageCss; }
    get getTemplatePageJs() { return this.templatePageJs; }
    get getRestoreCmd() { return this.RestoreCmd; }
    get getCreateCmd() { return this.CreateCmd; }
}


class ServerSettings{
    constructor(){
        this.baseDirectory = process.cwd();
        this.baseDirectoryModify = this.baseDirectory;
        this.error = false;
        this.errorReason = "";

        if(process.argv.length >= 3){
            if(/.*\.\..*/.test(process.argv[2])){
                this.errorReason = "relative root directory may not contain parent path elements.";
                this.error = true;
            }
            else{
                this.baseDirectoryModify += sep + process.argv[2];
            }
        }
    }
    get getBaseDir() {
        return this.baseDirectory;
    }
    get getBaseDirModify() {
        return this.baseDirectoryModify;
    }
    get hasError() {
        return this.error;
    }
    get getErrorReason() {
        return this.errorReason;
    }
}

let srvSettings = new ServerSettings();
if(srvSettings.hasError) {
    console.log("Error", srvSettings.getErrorReason);
}
let pgEdtiorSettings = new PageEditorSettings();
const methods = Object.create(null);

createServer((request, response) => {
    logRequestInfo(request);
    let handler = methods[request.method] || notAllowed;
    handler(request)
        .catch(error => {
            console.log("error: ", error);
            console.log("catch handler called");
            if(error.status != null) return error;
            return {body: String(error), status: 500};
        })
        .then(responseInfo => {handleResponseInfo(responseInfo, response)});
}).listen(8000);


function copyFile(src, dest) {

    console.log("copyFile Src: ", src);
    console.log("copyFile Dst: ", dest);

    return new Promise((resolve, reject) => {

        let readStream = createReadStream(src);
        readStream.once("error", (error) => {
            console.log(error);
            reject(error);
        });
        readStream.once("end", () => {
            console.log('done copying');
            resolve();
        });
        readStream.pipe(createWriteStream(dest));
    });
}

function handleResponseInfo({body, status = 200, type = "text/plain"}, response){
    console.log("function call: ", "handleResponseInfo");
    //console.log("body: ", body);
    console.log("status: ", status);
    console.log("type: ", type);

    response.writeHead(status, {"Content-Type": type});
    if (body && body.pipe) body.pipe(response);
    else response.end(body);    
}

function logRequestInfo(request){
    console.log("function call: ", "logRequestInfo");
    console.log("requestUrl: ", request.url);
}

async function notAllowed(request) {
    console.log("notAllowed called")
    return {
        status: 405,
        body: `Method ${request.method} not allowed.`
    };
}

function urlPath(url, allowedRootDir){
    console.log("function call: ", "urlPath");
    let {pathname} = parse(url);
    let path = resolve(
        srvSettings.getBaseDir,
        decodeURIComponent(pathname).slice(1));

    if(path != allowedRootDir && 
        !path.startsWith(allowedRootDir + sep)){
        console.log("forbidden request");
        throw {status: 403, body: "Forbidden"};
    }
    return path;
}

methods.GET = async function(request){
    console.log("function call: ", "GET");
    let path = urlPath(request.url, srvSettings.getBaseDir);
    let stats;
    try {
        stats = await stat(path);
    }
    catch(error){
        if (error.code != "ENOENT") throw error;
        else return {status: 404, body: "File not found"};
    }
    if(stats.isDirectory()){
        return {body: (await readdir(path)).join("\n")};
    }
    else{
        return {body: createReadStream(path),
                type: mime.getType(path)};
    }
}

methods.DELETE = async function(request){
    console.log("function call: ", "DELETE");
    let path = urlPath(request.url, srvSettings.getBaseDirModify);
    let stats;
    try{
        stats = await stat(path);
    }
    catch(error){
        if (error.code != "ENOENT") throw error;
        else return {status: 204};
    }
    if (stats.isDirectory()){
        return {status: 403, body: `Forbidden to delete ${path}`};
        //await rmdir(path)
    }
    else{
        await unlink(path);
    }
    return {status: 204};
}

function replaceStrInFile(filePath, from, to) {

    let fileContent = readFileSync(filePath, "utf8");
    fileContent = fileContent.replace(from, to);
    writeFileSync(filePath, fileContent);
}

async function pageEditorRestore(path) {

    console.log("function call: ", "pageEditorRestore");

    let promises = [
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageHtml,
            pgEdtiorSettings.getPathUserPages + pgEdtiorSettings.getTemplatePageHtml),
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageCss,
            pgEdtiorSettings.getPathUserPages + pgEdtiorSettings.getTemplatePageCss),
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageJs,
            pgEdtiorSettings.getPathUserPages + pgEdtiorSettings.getTemplatePageJs)
    ];

    await Promise.all(promises);
    
    return { 
        body: createReadStream(path),
        type: mime.getType(path)
    };
}

async function pageEditorCreate(path, pageName) {

    let stats;
    let noStatsError = true;
    try {
        stats = statSync(path);
    }
    catch(error) {
        noStatsError = false;
        if(error.code != "ENOENT") {
            throw error;
        }
    }
    if(noStatsError) {
        return {
            status: 409,
            body: `conflict, the page ${pageName} already exists`
        };
    }
    
    let promises = [
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageHtml,
            pgEdtiorSettings.getPathUserPages + pageName + ".html"),
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageCss,
            pgEdtiorSettings.getPathUserPages + pageName + ".css"),
        copyFile(
            pgEdtiorSettings.getPathTemplatePages + pgEdtiorSettings.getTemplatePageJs,
            pgEdtiorSettings.getPathUserPages + pageName + ".js")
    ];
        
    await Promise.all(promises);
    console.log("pageEditorCreate: ", "promises resolved");

    replaceStrInFile(
        pgEdtiorSettings.getPathUserPages + pageName + ".html",
        pgEdtiorSettings.getTemplatePageCss,
        pageName + ".css");
    replaceStrInFile(
        pgEdtiorSettings.getPathUserPages + pageName + ".html",
        pgEdtiorSettings.getTemplatePageJs,
        pageName + ".js");

    return {
        body: createReadStream(path),
        type: mime.getType(path)
    };
}

async function evalPostRequest(path, requestBody) {

    console.log("function call: ", "evalPostRequest");

    let match;
    if(new RegExp(`^${pgEdtiorSettings.getRestoreCmd}$`).test(requestBody)){
        return await pageEditorRestore(path);
    }
    else if(match = new RegExp(`^${pgEdtiorSettings.getCreateCmd}=(.+)$`).exec(requestBody)){
        console.log("match0", match[0]);
        console.log("match1", match[1]);
        let pageName = match[1];
        return await pageEditorCreate(path, pageName);
    }
    else
    {
        return {
            status: 400,
            body: `bad request ${requestBody}`
        };
    }
}

methods.POST = async function(request){
    
    let path = urlPath(request.url, srvSettings.getBaseDirModify);

    let requestBody = "";
    request.on("data", chunk => {
        requestBody += chunk.toString();
    });

    let promiseStream = new Promise((resolve, reject) => {
        request.on("end", () => {
            resolve(requestBody);
        });
        request.on("error", error => reject(error));
    });

    await promiseStream;
    let postResult = await evalPostRequest(path, requestBody);

    console.log("promiseStream awaited");
    console.log("postResult: ", postResult);
    return postResult;
}

methods.MKCOL = async function(request){
    console.log("function call: ", "MKCOL");
    let path = urlPath(request.url, srvSettings.getBaseDirModify);
    let stats;
    let exists = true;
    try{
        stats = await stat(path);
    }
    catch(error){
        if (error.code != "ENOENT") throw error;
        exists = false;
    }
    if(exists){

        if(stats.isDirectory()){
            return {status: 204};
        }
        else{
            return {
                status: 409,
                body: `Resource ${request.url} exists but is a file`
            };
        }
    }
    else{
        
        mkdirSync(path);
        return {status: 204};
    }
}

function pipeStream(from, to){
    return new Promise((resolve, reject) => {
        from.on("error", reject);
        to.on("error", reject);
        to.on("finish", resolve);
        from.pipe(to);
    });
}

methods.PUT = async function(request){
    console.log("function call: ", "PUT");
    let path = urlPath(request.url, srvSettings.getBaseDirModify);
    await pipeStream(request, createWriteStream(path));
    return {status: 204};
}
/**
 * @name fileTypes
 * @const
 * @property {Symbol} HTML A symbol representing html files.
 * @property {Symbol} CSS A symbol representing css files.
 * @property {Symbol} JS A symbol representing js files.
 * @property {function(Symbol)} toString Returns a string representation
 * of the given symbol.
 */
const fileTypes = Object.freeze({
    HTML: Symbol("html"),
    CSS: Symbol("css"),
    JS: Symbol("js"),
});

/**
 * Matches the given Symbol to a text. In case an unknown
 * Symbol is given, an error is thrown.
 * 
 * @param {Symbol} fileType 
 * @returns 
 */
function getStringVal(fileType){
    switch(fileType){
        case fileTypes.HTML: return "html";
        case fileTypes.CSS: return "css";
        case fileTypes.JS: return "js";
    }
    throw new Error(`Type ${typeof fileType} not supported`);
}

/**
 * @const {String} basePath The relative path where the pages must live. 
 */
const basePath = "/page_editor/user_pages";

/**
 * @name state
 * @property {String} currentPage The name of the currently selected page.
 *      The page must live in the [user-pages]{@link basePath} directory.
 */

/**
 * Sets the current state of this application.
 * 
 * @param {object} newState The state currently holds only
 *      the current page name.
 */
function setState(newState)
{
    console.log("setState: ", newState.currentPage);
    sessionStorage.setItem("state.currentPage", newState.currentPage);
}
/**
 * Gets the current state of the application
 * 
 * @returns {object} The state object currently holds only
 *      the current page.
 */
function getState(){
    let currentStateCp = sessionStorage.getItem("state.currentPage");
    if(currentStateCp) return {currentPage: currentStateCp};
    else return {currentPage: "start"};
}

/**
 * @param {String} pageName The name of a page without file ending.
 * @param {Symbol} type A symbol representing a file type.
 * @returns {String} The path of a file belonging to a page.
 */
function getPath(pageName, type) {
    return basePath + "/" + pageName + "." + getStringVal(type);
}

/**
 * This function fills three textarea elements with text. One
 * area is filled with the html, another with the css and the
 * third with the javascript of a [page]{@link pageName}.
 * 
 * @param {String} pageName The name of a page without file ending.
 */
function fillTextAreas(pageName) {

    let textAreaHtml = document.querySelector("#editor-html");
    let textAreaCss = document.querySelector("#editor-css");
    let textAreaJs = document.querySelector("#editor-js");

    let pageFilesPath = [
        {path: getPath(pageName, fileTypes.HTML), tA: textAreaHtml},
        {path: getPath(pageName, fileTypes.CSS), tA: textAreaCss},
        {path: getPath(pageName, fileTypes.JS), tA: textAreaJs}
    ];

    for(let pageFilePath of pageFilesPath) {
        fetch(pageFilePath.path)
            .then(resp => resp.text())
            .then(text => {
                pageFilePath.tA.textContent = text;
            })
            .catch(error => console.log("fillTextAreas: ", error))
    }
}

/**
 * This function fills a select element (drop-down) with
 * the currently available pages. The pages can be queries
 * from the server. The server repsonds with simple text,
 * whereas each line in the returned text corresponds to
 * a file.
 * 
 * @param {String} pageName The name of a page without file ending.
 */
function fillPageSelect(pageName) {

    // Query the selector element.
    let select = document.querySelector(".select-page");
    // Clear all exising entries.
    select.options.length = 0;

    // Fetch all pages stored on the server.
    fetch(basePath)
        .then(response => response.text())
        .then(text => {

            let elems = text.split("\n");
            for(let elem of elems){

                let elemNoFileExt = removeFileExt(elem);

                // Because a page consists of a html, a css and a
                // js file, there must be a check so only one item
                // per page is added to the select.
                let elemExists = false;
                for(let i = 0; i < select.options.length; i++){
                    if(select.options[i].value == elemNoFileExt){
                        elemExists = true;
                    }
                }

                // If the element has not already been inserted into
                // the select, it will now be added.
                if(!elemExists){
                    select.options[select.options.length]
                         = new Option(elemNoFileExt, elemNoFileExt);
                }
            }
            select.value = pageName
        });
}

/**
 * @param {String} path A filename for which the
 *      file-extension should be removed.
 * @returns The given [path]{@link: path} without a file 
 *      extension.
 */
function removeFileExt(path){
    return path.replace(/(.+)\.[^.]+$/, "$1");
}

/**
 * Navigates the browser to the given url.
 * 
 * @param {String} path The url which should be loaded
 */
function loadPage(path){
    window.location.assign(path);
    //window.location.assign(path + "?nocache=" + (new Date()).getTime());
}

/**
 * Fills the content of dynamic elements with info
 * retrieved from a server.
 * 
 * @param {String} pageName The name of the page which will be displayed.
 */
function fillPageContent(pageName)
{
    fillTextAreas(pageName);
    fillPageSelect(pageName);
    document.querySelector(".select-page").value = pageName;
}

fillPageContent(getState().currentPage);

// Saves the changes by the user on the server and refreshes the
// page in order for the user to see them.
document.querySelector(".button-save").addEventListener("click", () => {

    let textAreaHtml = document.querySelector("#editor-html");
    let textAreaCss = document.querySelector("#editor-css");
    let textAreaJs = document.querySelector("#editor-js");

    // An array of paths to files which should be stored
    // on the server. The content of the files will be determined by
    // the content of the according textarea elements.
    let pageFilesPath = [
        {path: getPath(getState().currentPage, fileTypes.HTML), tA: textAreaHtml},
        {path: getPath(getState().currentPage, fileTypes.CSS), tA: textAreaCss},
        {path: getPath(getState().currentPage, fileTypes.JS), tA: textAreaJs}
    ];

    // The current number of successfull requests.
    // This will be used to trigger a page-reload
    // at the appropriate time.
    let succeededRequests = 0;

    // Save the files belonging to the current page
    // on the server.
    for(let filePath of pageFilesPath){

        let text = filePath.tA.value;

        fetch(
            filePath.path,
            {
                method: "PUT",
                body: text,
                header: new Headers(
                {
                    "Content-Type": "text/plain"
                })        
            }
        ).then(response => {
            return response.text();
        }).then(text => {

            // If all three requests have succeeded, the
            // page can be reloaded.
            if(++succeededRequests == 3){
                window.location.reload(true);
            }
        }).catch(error => {
            console.log("Button-Save, put request error: ", error);
        });
    }
});

// Displays another page as requested by the user.
document.querySelector(".select-page").addEventListener("change", () => {

    let select = document.querySelector(".select-page");

    if(getState().currentPage == select.value){
        return;
    }
    setState({currentPage: select.value})
    // Replace the current page with the newly selected one.
    let path = getPath(getState().currentPage, fileTypes.HTML);
    loadPage(path);
});

// Adds a new page as requested by the user. The new page is
// a copy of the template page.
document.querySelector(".add-page").addEventListener("click", () => {

    let textField = document.querySelector(".add-page-text");
    let pageName = textField.value;

    let newPath = getPath(pageName, fileTypes.HTML);

    fetch(
        newPath, 
        { method: "POST",
          body: `pageEditor_create=${pageName}`,
          header: new Headers(
            {
                "Content-Type": "text/plain",
                "Cache-Control": "no-cache"
            })
        }).then(response => {
            if(response.status != 200){
                throw new Error(`Failed to add page, http status ${response.status}.`);
            }
            response.text();
        })
        .then(text => {
            setState({currentPage: pageName});
            loadPage(newPath);
        })
        .catch(error => console.log("Error", error));
});




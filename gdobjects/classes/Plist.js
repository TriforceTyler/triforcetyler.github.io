const sub_dom = new DOMParser()

class Plist {
    constructor(data, noErrors) {
        data = data.trim()

        // check if maybe it's a json?
        if (!data.startsWith("<")) {
            try {
                let jsonData = JSON.parse(data)

                try {
                    this.data = parseJSON(jsonData)
                }
                catch(err) {
                    console.error(err)
                }
            }
            catch(e) { }
        }

        let plist = sub_dom.parseFromString(data.trim(), "text/xml")
        let plistFrames = plist.children[0].children[0].children
        if (plistFrames[0].nodeName == "parsererror") return noErrors ? null : console.warn(plistFrames[0].innerHTML)
        this.data = parseDict(plistFrames)
    }
}

function parseDict(dict) {
    let data = {}
    for (let i=0; i < dict.length; i += 2) {
        let frameName = dict[i].innerHTML
        let frameData = dict[i + 1]
        if (frameData) {
            let dataType = frameData.nodeName
            if (dataType == "dict") data[frameName] = parseDict(frameData.children)
            else if (dataType == "true" || dataType == "false") data[frameName] = (dataType == "true")
            else data[frameName] = frameData.innerHTML
        }
    }
    return data
}

function parsePlistArray(data) {
    if (typeof data == "object") return [data.w, data.h]
    else return data.replace(/[^0-9,-.]/g, "").split(",").map(x => +x)
}

function parsePlistRect(data) {
    if (typeof data == "object") return [[data.x, data.y], [data.w, data.h]]
    else return data.slice(1, -1).split("},{").map(x => parsePlistArray(x))
}

function parseJSONFrame(data) {
    return {
        textureRotated: data.rotated,
        spriteSize: data.spriteSourceSize,  // not confusing at all
        spriteSourceSize: data.sourceSize,
        textureRect: data.frame
    }
}

function parseJSON(data) {

    let frames = {}
    let meta = data.meta

    function addFrames(data) {
        if (Array.isArray(data)) {
            data.forEach(x => {
                frames[x.filename] = parseJSONFrame(x)
            })
        }

        else Object.entries(data).forEach(x => {
            frames[x[0]] = parseJSONFrame(x[1])
        })
    }

    if (data.frames) addFrames(data.frames)

     // currently only supports one sheet because of metadata... for now
    if (Array.isArray(data.textures)) {
        addFrames(data.textures[0].frames)
        if (!meta.image) {
            meta = data.textures[0]
            delete meta.frames
            Object.assign(meta, data.meta)
        }
    }

    meta.textureFileName = meta.image

    return {
        frames,
        metadata: meta
    }
}

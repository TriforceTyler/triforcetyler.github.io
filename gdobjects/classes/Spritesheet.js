let LOADER_ACTIVE = false

class Spritesheet {
    constructor(frames, metadata, b64) {

        this.name = metadata.textureFileName.split("/").pop()
        this.size = parsePlistArray(metadata.size)
        this.b64 = b64
        this.data = {}
        this.sprites = {}
        this.texture = null
        
        Object.entries(frames).forEach(frame => {
            let [frameName, frameData] = frame
            let isRotated = false
            let dat = {}

            Object.entries(frameData).forEach(dict => {
                let [keyName, keyData] = dict

                // older sheets use different keys
                if (keyName == "frame") keyName = "textureRect"
                else if (keyName == "rotated") keyName = "textureRotated"
                else if (keyName == "offset") keyName = "spriteOffset"
                else if (keyName == "sourceSize") keyName = "spriteSourceSize"

                if (["spriteOffset", "spriteSize", "spriteSourceSize"].includes(keyName)) {
                    dat[keyName] = parsePlistArray(keyData)
                }
    
                else if (keyName == "textureRotated") {
                    isRotated = frameData[dict[0]]
                    dat[keyName] = isRotated
                }
    
                else if (keyName == "textureRect") {
                    let textureArr = parsePlistRect(keyData)
                    dat[keyName] = textureArr
                    dat.texturePos = textureArr[0]
                    dat.textureSize = textureArr[1]
                }  
            })
    
            if (isRotated) dat.textureSize.reverse()
            if (!dat.spriteOffset) dat.spriteOffset = [0, 0]
            if (!dat.spriteSize) dat.spriteSize = [...dat.textureSize]
            if (!dat.spriteSourceSize || !dat.spriteSourceSize[1]) dat.spriteSourceSize = dat.spriteSize

            // i... don't even.. wh... (https://cdn.discordapp.com/attachments/861271667601833984/1017806683763916923/unknown.png)
            if (dat.spriteOffset[0] > (dat.spriteSourceSize[0] * 12) || dat.spriteOffset[1] > (dat.spriteSourceSize[1] * 12)) {
                dat.spriteSize = [0, 0]
                dat.spriteSourceSize = [0, 0]
                dat.spriteOffset = [0, 0]
            }

            // use offset if sourcesize is smaller for some reason
            let safeSourceSize = dat.spriteSize.map((x, y) => x + ( 2 * Math.abs(dat.spriteOffset[y])))
            if ((safeSourceSize[0] > dat.spriteSourceSize[0]) || (safeSourceSize[1] > dat.spriteSourceSize[1])) dat.spriteSourceSize = safeSourceSize

            // old rotated system
            if (isRotated && frameData.rotated == true) {
                dat.spriteSize.reverse()
                dat.spriteSourceSize.reverse()
            }

            dat.textureBounds = dat.texturePos.concat(dat.texturePos.map((x, y) => x + dat.textureSize[y]))
            this.data[frameName] = dat
        })
    }

    loadTextures(callback) {
        return new Promise((res, rej) => {
            if (!loader.resources[this.name]) loader.add({ name: this.name, url: this.b64 })

            loader.load(async (l, resources) => {
                if (callback) callback()
                let texture = resources[this.name].texture
                this.texture = texture
                // if (this.texture.width >= 10000 || this.texture.height >= 10000) return rej(new Error("Spritesheet is too large! (10000 x 10000 max)"))
                let sheet = new PIXI.Spritesheet(texture, this.toPIXISheet())
                sheet.parse().then(() => {
                    for (const [name, texture] of Object.entries(sheet.textures)) {
                        console.log({name, texture})
                        this.sprites[name] = new PIXI.Sprite(texture)
                    }
                    res()
                }).catch(e => rej(e))
            })
        })
    }

    toPIXISheet() {
        let data = { meta: { scale: 1, image: this.name, format: "RGBA8888", size: { w: this.texture.width, h: this.texture.height }  }, frames: {} }
        for (const [n, x] of Object.entries(this.data)) {
            let obj = {}
            obj.frame = { x: x.texturePos[0], y: x.texturePos[1], w: x.spriteSize[0], h: x.spriteSize[1] }
            obj.rotated = x.textureRotated
            obj.trimmed = true
            data.anchor = { x: 0.5, y: 0.5 }
            obj.spriteOffset = { x: x.spriteOffset[0], y: x.spriteOffset[1] }
            obj.sourceSize = { w: x.spriteSourceSize[0], h: x.spriteSourceSize[1] }
            obj.spriteSourceSize = { x: ((x.spriteSourceSize[0] - x.spriteSize[0]) / 2) + x.spriteOffset[0], y: ((x.spriteSourceSize[1] - x.spriteSize[1]) / 2) - x.spriteOffset[1], w: x.spriteSize[0], h: x.spriteSize[1] }
            data.frames[n] = obj
        }
        return data
    }

    extractAll() {
        let blobs = {}
        Object.keys(this.sprites).forEach(name => {
            blobs[name] = canvasToBlob(extractTexture(this, name))
        })
        return blobs
    }

}

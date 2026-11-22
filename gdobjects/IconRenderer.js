const WHITE = 0xffffff
const COLOR_NAMES = { "1": "Color 1", "2": "Color 2", "g": "Glow", "w": "White", "u": "UFO Dome" }
const FORM_NAMES = { "player": "cube", "player_ball": "ball", "bird": "ufo", "dart": "wave" }
const EXTENDED_FORM_NAMES = Object.assign({ icon: "cube", special: "trail", death: "deathEffect", color: "color1" }, FORM_NAMES)
const ACHIEVEMENT_FORM_NAMES = { "cube": "icon", "ufo": "bird", "wave": "dart", "color1": "color", "deathEffect": "death", "trail": "special" }
const SPECIAL_FORM_NAMES = { "trail": "Trail", "deathEffect": "Death Effect", "shipFire": "Ship Fire", "item": "Item" }
const QUALITY_NAMES = { low: 'low', sd: 'low', med: 'hd', medium: 'hd', hd: 'hd' }
const POSITION_MULTIPLIERS = { uhd: 4, hd: 2, low: 1 }
const FORM_Y_OFFSETS = { player_ball: -10, bird: 30, spider: 7, swing: -15 }
const CUBE_OFFSETS = {
    ship: { "x": 0, "y": 5, "scale": 0.55 },
    bird: { "x": 0, "y": 6, "scale": 0.55 },
    jetpack: { "x": 3, "y": 2, "scale": 0.6 }
}

const DOM_PARSER = new DOMParser()

/*
REQUIRED RESOURCES:
    robotAnimations - positioning for robot and spider parts
    iconCounts - max ID for each icon, for validation. skipped if not provided
    colors - maps color ID to rgb
    forms - maps form name to internal filename
*/
class IconRenderer {
    constructor(app, resources) {

        this.app = app
        this.resources = resources || {}

        this.loadedAssets = {}     // pixi Texture data for icon spritesheets
        this.iconTextures = {}     // pixi Texture data for icon layers
        this.iconFrames = {}       // plist data for icon layers
    }    

    // ==== UTILS ==== //

    // downloads base64 image
    static downloadFile(data, name) {
        let url = window.URL.createObjectURL(data);
        let downloader = document.createElement('a');
        downloader.href = url
        downloader.setAttribute("download", name);
        document.body.appendChild(downloader);
        downloader.click();
        document.body.removeChild(downloader);
    }

    // returns val if num is valid, otherwise defaultVal
    static validNum(val, defaultVal) {
        let num = +val
        return isNaN(num) ? defaultVal : num
    }

    // determine which color to use for glow color
    static getGlowColor(colors) {
        let glowCol = Number.isInteger(colors["g"]) ? colors["g"] : (colors[2] === 0 ? colors[1] : colors[2])
        // if (glowCol === 0) glowCol = WHITE // white glow if both colors are black
        return glowCol
    }
    
    // convert rgb color (like 255, 128, 0) to decimal (like 0xff8000)
    static rgbToDecimal(rgb) {
        return (rgb.r << 16) + (rgb.g << 8) + rgb.b;
    }

    // if number is less than 10, add a leading zero
    static padZero(num) {
        if (isNaN(num)) return num
        let numStr = num.toString()
        if (num < 10) numStr = "0" + numStr
        return numStr
    }


    // clamp icon ID to valid one that exists
    validateIconID(id, form) {
        if (!this.resources.iconCounts || !this.resources.iconCounts[form]) return id  // skip validation if no icon counts

        let realID = Math.min(this.resources.iconCounts[form], Math.abs(IconRenderer.validNum(id, 1)))
        if (realID === 0 && !["player", "player_ball", "ship"].includes(form)) realID = 1  // icons with valid ID 0
        return realID
    }

    // get decimal color from either hex code or color ID
    parseIconColor(col, fallback = WHITE) {
        if (!col && col != 0) return fallback
        else if (typeof col == "string" && col.length == 6) return parseInt(col, 16)
        else if (!this.resources.colors) return fallback

        let rgb = this.resources.colors[col]
        return rgb ? IconRenderer.rgbToDecimal(rgb) : fallback;
    }


    // get internal form name from any form string (e.g. "ufo" -> "bird")
    parseIconForm(form, fallback = "player") {
        if (!this.resources.forms) return fallback
        let foundForm = this.resources.forms[form] || this.resources.forms[FORM_NAMES[form]]
        return foundForm ? foundForm.form : fallback
    }



    // ==== ICON LOADING + PARSING ==== //
    
    // fetches a texture from a path, caches it, returns PIXI Texture
    async loadTexture(name, path) {
        let loaded = await PIXI.Assets.load(path)
        if (loaded) this.loadedAssets[name] = loaded
        return loaded
    }

    // parses a plist file, converts it to .json
    parsePlist(data) {
        let plist = DOM_PARSER.parseFromString(data, "text/xml")
        let frames = plist.children[0].children[0].children[1].children
        let positionData = {}
        let dataFrames = {}
        for (let i = 0; i < frames.length; i += 2) {
            let frameName = frames[i].innerHTML
            let frameData = frames[i + 1].children
            let isRotated = false
            dataFrames[frameName] = {}
            positionData[frameName] = {}

            for (let n = 0; n < frameData.length; n += 2) {
                let keyName = frameData[n].innerHTML
                let keyData = frameData[n + 1].innerHTML
                if (["spriteOffset", "spriteSize", "spriteSourceSize"].includes(keyName)) {
                    dataFrames[frameName][keyName] = this.parseWeirdPlistArray(keyData)
                }

                else if (keyName == "textureRotated") {
                    isRotated = frameData[n + 1].outerHTML.includes("true")
                    dataFrames[frameName][keyName] = isRotated
                }

                else if (keyName == "textureRect") {
                    let textureArr = keyData.slice(1, -1).split("},{").map(x => this.parseWeirdPlistArray(x))
                    positionData[frameName].pos = textureArr[0]
                    positionData[frameName].size = textureArr[1]
                }
            }

            if (isRotated) {
                if (dataFrames[frameName].spriteSize.join(",") == positionData[frameName].size.join(",")) {
                    positionData[frameName].size.reverse()
                }
            }

        }
        return { pos: positionData, frames: dataFrames }
    }

    // it's all in the name
    parseWeirdPlistArray(data) {
        return data.replace(/[^0-9,-.]/g, "").split(",").map(x => +x)
    }

    // prepare to load a specific icon, returns a promise that goes through the functions below
    loadIconLayers(form, id) {
        let iconStr = `${form}_${IconRenderer.padZero(this.validateIconID(id, form))}`
        return this.loadIconSheet(iconStr)
    }

    // fetches and parses an icon plist + sheet
    async loadIconSheet(iconStr) {
        let plist = await fetch(`/icons/${iconStr}-uhd.plist`).then(pl => pl.text())
        let data = this.parsePlist(plist)

        Object.keys(data.frames).forEach(x => {
            this.iconFrames[x] = data.frames[x]
        })

        let sheetName = iconStr + "-sheet"
        
        let texture = await this.loadTexture(sheetName, `/icons/${iconStr}-uhd.png`)
        
        return this.readIconData(texture, data.pos)
    }

    // reads an icon spritesheet and creates a Texture for each frame
    async readIconData(spritesheet, plistData, folder = this.iconTextures, warnings = []) {
        let hasError = false;
        for (const x of Object.keys(plistData)) {
            let bounds = plistData[x]
            let size = bounds.rotated ? [bounds.size[1], bounds.size[0]] : bounds.size

            let textureRect = new PIXI.Rectangle(bounds.pos[0], bounds.pos[1], size[0], size[1])

            let endX = bounds.pos[0] + size[0]
            let endY = bounds.pos[1] + size[1]
            if (endX > spritesheet.width || endY > spritesheet.height) {
                if (warnings.length < 1) alert(`Warning: Frame '${x}' expects pixels outside of the width/height of the image file! This is supported by Geometry Dash, but should never happen. ` +
                    `\n\nThe image will be automatically extended, but please consider fixing your sprite offset.\n\nX pos: ${endX} (width: ${spritesheet.width})\nY pos: ${endY} (height: ${spritesheet.height})`)
                warnings.push(x)
                if (warnings.length > 99) return

                hasError = true
                let newTexture = await extendTexture(spritesheet, Math.max(endX, spritesheet.width), Math.max(endY, spritesheet.height))

                return this.readIconData(newTexture, plistData, folder, warnings)  // after extending, try again
            }

            let partTexture = new PIXI.Texture(spritesheet, textureRect)
            folder[x] = partTexture
        }

        if (warnings.length > 1) alert("The same issue also applies to:\n\n" + warnings.join("\n"))

        return spritesheet
    }

    // experimental: adds padding around a texture if the plist coordinates go out of the sheet (which it never should)
    async extendTexture(texture, endX, endY) {
        let img = texture.baseTexture.resource.source
        let canv = document.createElement('canvas')
        let ctx = canv.getContext('2d')
        canv.width = endX
        canv.height = endY
        ctx.drawImage(img, 0, 0)
        let url = canv.toDataURL()
        let loaded = await PIXI.Assets.load({ src: url, alias: "temp_extended_texture_" + url.slice(-32) + String(Math.random()).slice(2) })
        return loaded
    }

}


class Icon {
    constructor(renderer, data = {}, cb) {

        this.renderer = renderer
        this.app = renderer.app

        this.sprite = new PIXI.Container();
        this.form = data.form || "player"
        this.id = data.isCustom ? data.id : this.renderer.validateIconID(data.id, this.form)

        let vn = IconRenderer.validNum;
        this.colors = data.rawColors || {
            "1": vn(data.col1, 0xafafaf),    // primary
            "2": vn(data.col2, WHITE),       // secondary
            "g": vn(data.colG, vn(+data.colG, null)), // glow
            "w": vn(data.colW, vn(+data.colW, WHITE)), // white
            "u": vn(data.colU, vn(+data.colU, WHITE)), // ufo
        }

        this.glow = !!data.glow
        this.layers = []
        this.glowLayers = []
        this.customFiles = null
        this.complex = ["spider", "robot"].includes(this.form)
        this.quality = data.quality ? (QUALITY_NAMES[data.quality.toLowerCase()] || 'uhd') : 'uhd'

        if (data.isCustom && data.files) this.customFiles = data.files

        // most forms
        if (!this.complex) {
            let extraSettings = {}
            if (data.noUFODome) extraSettings.noDome = true
            if (data.isCustom) extraSettings.customFiles = this.customFiles
            if (this.form == "player_ball") {
                this.ballSpeed = (data.ballSpeed || 0)
                if (this.ballSpeed != 0 && !this.ballRolling) this.rollBall()
            }
            let basicIcon = new IconPart(this.renderer, this.form, this.id, this.colors, this.glow, extraSettings)
            this.sprite.addChild(basicIcon.sprite)
            this.layers.push(basicIcon)

            let foundGlow = basicIcon.sections.find(x => x.colorType == "g")
            if (foundGlow) this.glowLayers.push(foundGlow)
        }

        // spider + robot
        else {
            let idlePosition = this.getAnimation(data.animation, data.animationForm).frames[0]
            let cFiles = data.isCustom ? this.customFiles : undefined
            idlePosition.forEach((x, y) => {
                x.name = this.renderer.resources.robotAnimations.info[this.form].names[y]
                let part = new IconPart(this.renderer, this.form, this.id, this.colors, false, { part: x, skipGlow: true, customFiles: cFiles })
                this.positionPart(x, y, part.sprite, this.form, false, this.quality)

                let glowPart = new IconPart(this.renderer, this.form, this.id, this.colors, true, { part: x, onlyGlow: true, customFiles: cFiles })
                this.positionPart(x, y, glowPart.sprite, this.form, true, this.quality)
                glowPart.sprite.visible = (this.glow || this.colors[1] === 0)
                this.glowLayers.push(glowPart)

                this.layers.push(part)
                this.sprite.addChild(part.sprite)
            })

            let fullGlow = new PIXI.Container();
            this.glowLayers.forEach(x => fullGlow.addChild(x.sprite))
            this.sprite.addChildAt(fullGlow, 0)
            if (typeof Ease !== "undefined") this.ease = new Ease.Ease()
            this.animationSpeed = Math.abs(Number(data.animationSpeed) || 1)
            if (data.animation) this.setAnimation(data.animation, data.animationForm)
        }

        if (this.quality != 'uhd')
            this.sprite.scale.set(this.getPositionMultiplier("uhd") / this.getPositionMultiplier(this.quality))

        if (!data.dontAdd) {
            this.app.stage.removeChildren()
            this.app.stage.addChild(this.sprite)
        }

        if (cb) cb(this)

    }

    // how much to multiply icon positions by, depending on quality
    getPositionMultiplier(quality = "uhd") {
        return POSITION_MULTIPLIERS[quality] ||  POSITION_MULTIPLIERS.uhd
    }

    // position icon in center of renderer + offset 
    updatePosition() {
        this.sprite.position.set(this.app.renderer.width / 2, (this.app.renderer.height / 2) + (FORM_Y_OFFSETS[this.form] || 0))
    }

    positionPart(part, partIndex, layer, formName, isGlow, quality) {
        let positionMultiplier = this.getPositionMultiplier(quality)
        layer.position.x += (part.pos[0] * positionMultiplier)
        layer.position.y -= (part.pos[1] * positionMultiplier)
        layer.scale.x = part.scale[0]
        layer.scale.y = part.scale[1]
        if (part.flipped[0]) layer.scale.x *= -1
        if (part.flipped[1]) layer.scale.y *= -1
        layer.angle = part.rotation
        layer.zIndex = part.z

        if (!isGlow) {
            let tintInfo = this.renderer.resources.robotAnimations.info[formName].tints
            let foundTint = tintInfo[partIndex]
            if (foundTint > 0) {
                let darkenFilter = new PIXI.ColorMatrixFilter();
                darkenFilter.brightness(0)
                darkenFilter.alpha = (255 - foundTint) / 255
                layer.filters = [darkenFilter]
            }
        }
    }

    getAllLayers() {
        let allLayers = [];
        (this.complex ? this.glowLayers : []).concat(this.layers).forEach(x => x.sections.forEach(s => allLayers.push(s)))
        return allLayers
    }

    getLayerArr() {
        if (!this.complex) return this.layers
        else return this.layers.concat({ sections: this.glowLayers.map(x => x.sections[0]), part: { name: "Glow" } })
    }

    setColor(colorType, newColor, extra = {}) {
        let colorStr = String(colorType).toLowerCase()
        if (!colorType || !Object.keys(this.colors).includes(colorStr)) return
        else this.colors[colorStr] = newColor
        let newGlow = IconRenderer.getGlowColor(this.colors)
        this.getAllLayers().forEach(x => {
            if (colorType != "g" && x.colorType == colorStr) x.setColor(newColor)
            if (!extra.ignoreGlow && x.colorType == "g") x.setColor(newGlow)
        })
        if (!this.glow && colorStr == "1") {
            let shouldGlow = newColor == 0
            this.glowLayers.forEach(x => x.sprite.visible = shouldGlow)
        }

        if (this.secondaryIcon) this.secondaryIcon.setColor(colorType, newColor, extra)
    }

    copyColorsFrom(i1) {
        Object.entries(i1.colors).forEach(c => {
            this.setColor(c[0], c[1])
        })
    }

    setGlow(toggle) {
        this.glow = !!toggle
        this.glowLayers.forEach(x => x.sprite.visible = (this.colors["1"] == 0 || this.glow))

        if (this.secondaryIcon) this.secondaryIcon.setGlow(toggle)
    }

    formName() {
        return FORM_NAMES[this.form] || this.form
    }

    isGlowing() {
        return !!this.glowLayers[0]?.sprite.visible
    }

    // icon inside ships, ufos, etc
    // id can be a numberical ID or an Icon that's already been rendered
    addSecondaryIcon(id = 1, cb) {

        return new Promise(async (res, rej) => {

            let offset = CUBE_OFFSETS[this.form]
            if (!offset) return rej(`Form ${this.form} has no secondary icon offset defined`)

            let providedIcon = (typeof id == "object" && id.sprite)

            // numerical ID provided, load it
            if (!providedIcon)
                await this.renderer.loadIconLayers("player", id)

            let i2 = providedIcon ? id : new Icon(this.renderer, {
                form: "player", id, dontAdd: true,
                rawColors: this.colors, glow: this.glow
            })

            // remove existing
            if (this.secondaryIcon) this.removeSecondaryIcon()

            this.secondaryIcon = i2

            let iconScale = this.getPositionMultiplier(this.quality) / 4
            
            i2.sprite.scale.set(offset.scale * iconScale)
            i2.sprite.position.set(offset.x * 8 * iconScale, offset.y * -8 * iconScale)
            this.sprite.children[0].addChildAt(i2.sprite, 1)

            if (providedIcon) {
                i2.copyColorsFrom(this)
                i2.setGlow(this.glow)
            }

            res(this)
        })

    }

    removeSecondaryIcon(destroy) {
        if (this.secondaryIcon) {
            if (destroy) this.secondaryIcon.sprite.destroy()
            else this.sprite.children[0].children = this.sprite.children[0].children.filter(x => x != this.secondaryIcon.sprite)
            this.secondaryIcon = null
        }
    }

    setBallSpeed(speed, stop) {
        if (this.form != "player_ball") return
        this.ballSpeed = speed

        if (stop) this.sprite.angle = 0
        else if (this.ballSpeed != 0 && !this.ballRolling) this.rollBall()
    }

    rollBall() {
        if (!this.ballSpeed) return this.ballRolling = false
        this.ballRolling = true
        this.sprite.angle += this.ballSpeed
        requestAnimationFrame(() => this.rollBall())
    }

    getAnimation(name, animForm) {
        let animationList = this.renderer.resources.robotAnimations.animations[animForm || this.form]
        return animationList[name || "idle"] || animationList["idle"]
    }

    clearAnimation() {
        this.ease.removeAll()
        this.isRecording = false
        this.recordedFrames = []
        this.animationFrame = 0
    }

    setAnimation(data, animForm) {
        let animData = this.getAnimation(data, animForm) || this.getAnimation("idle")
        this.clearAnimation()
        this.animationName = data
        this.runAnimation(animData, data)
    }

    runAnimation(animData, animName, duration) {
        animData.frames[this.animationFrame].forEach((newPart, index) => {
            let section = this.layers[index]
            let glowSection = this.glowLayers[index]
            let truePosMultiplier = this.getPositionMultiplier(this.quality)
            if (!section) return

            // gd is weird with negative rotations
            // this isn't perfect (e.g. robot run2) but it's the best i can do
            let realRot = newPart.rotation
            if (realRot < -180) realRot += 360

            let movementData = {
                x: newPart.pos[0] * truePosMultiplier,
                y: newPart.pos[1] * truePosMultiplier * -1,
                scaleX: newPart.scale[0],
                scaleY: newPart.scale[1],
                angle: realRot
            }
            if (newPart.flipped[0]) movementData.scaleX *= -1
            if (newPart.flipped[1]) movementData.scaleY *= -1

            let dur = (!duration ? 1 : (animData.info.duration / (this.animationSpeed || 1)))
            let bothSections = [section, glowSection]
            bothSections.forEach((x, y) => {
                let easing = this.ease.add(x.sprite, movementData, { duration: duration || 1, ease: 'linear' })
                let continueAfterEase = animData.frames.length > 1 && y == 0 && index == 0 && animName == this.animationName
                if (continueAfterEase) easing.on('complete', () => {
                    this.animationFrame++
                    if (this.animationFrame >= animData.frames.length) {
                        if (animData.info.loop) {
                            this.animationFrame = 0;
                        }
                        else setTimeout(() => {
                            this.animationFrame = 0;
                            this.runAnimation(animData, animName, dur);
                        }, 1000);
                    }
                    if (this.animationFrame < animData.frames.length) this.runAnimation(animData, animName, dur)
                })
            })
        })
    }

    recordAnimation(animName = this.animationName) {

        if (!window.UPNG) appendScript("upng")
        if (!window.pako) appendScript("pako")

        alert("Animation recording is a work in progress!!! If you found this function then feel free to use it, but looping might be a bit buggy.")

        if (!this.animationFrame || this.animationSpeed < 0.1) return console.info("No animation to record!")

        let w = this.app.view.width
        let h = this.app.view.height

        // needed because so canvas doesn't autocrop :v
        let bounds = new PIXI.Graphics();
        bounds.lineStyle(1, 0xFF0000);
        bounds.drawRect(0, 0, w - 1, h - 1);
        bounds.alpha = 0
        this.app.stage.addChild(bounds);

        const RECORDING_FPS = (this.animationSpeed <= 0.5 ? 30 : 60)
        const FRAME_DELAY = (1000 / RECORDING_FPS)

        this.setAnimation(animName)
        this.isRecording = true
        this.recordedFrames = []

        let firstFrame = -1
        let passedFrame = false

        let snapFrame = () => {
            if (firstFrame == -1 && this.animationFrame == 0) return // no idea why this works but removing it breaks things

            let frame = new Uint8Array(this.app.renderer.extract.pixels(this.app.stage)).buffer
            // console.log([this.animationFrame, firstFrame])

            if (firstFrame == -1) firstFrame = this.animationFrame  // on first frame
            else if (firstFrame != this.animationFrame) passedFrame = true  // on passing first frame
            else if (passedFrame) { // on returning to first frame
                clearInterval(recorder)
                this.app.stage.removeChild(bounds)
                this.isRecording = false

                console.info("[animation] Downloading .apng file")
                let apng = UPNG.encode(this.recordedFrames, w, h, 0, new Array(this.recordedFrames.length).fill(FRAME_DELAY))
                let apngBlob = new Blob([apng], { type: "image/apng" })
                IconRenderer.downloadFile(apngBlob, this.getDownloadString() + "_" + animName + ".apng")

                return
            }

            this.recordedFrames.push(frame)
            console.info(`[animation] Recorded frame ${this.animationFrame}`)
        }

        let recorder = setInterval(async () => {
            snapFrame()
        }, FRAME_DELAY);
        snapFrame()
    }

    async getDataURL() {
        let [imgData, pixels] = await Promise.all([
            this.app.renderer.extract.image(this.sprite, "image/png", 1),
            this.app.renderer.extract.pixels(this.sprite)
        ]);

        await new Promise((res, rej) => {
            imgData.onload = () => res(imgData);
            imgData.onerror = (e) => rej(e);
        })

        let spriteSize = [imgData.width || Math.ceil(this.sprite.width), imgData.height || Math.ceil(this.sprite.height)]

        let xRange = [spriteSize[0], 0]
        let yRange = [spriteSize[1], 0]

        for (let i = 3; i < pixels.length; i += 4) {
            let alpha = pixels[i]
            let realIndex = (i - 3) / 4
            let pos = [realIndex % spriteSize[0], Math.floor(realIndex / spriteSize[0])]

            if (alpha > 10) { // if pixel is not blank...
                if (pos[0] < xRange[0]) xRange[0] = pos[0]      // if x pos is < the lowest x pos so far
                else if (pos[0] > xRange[1]) xRange[1] = pos[0] // if x pos is > the highest x pos so far
                if (pos[1] < yRange[0]) yRange[0] = pos[1]      // if y pos is < the lowest y pos so far
                else if (pos[1] > yRange[1]) yRange[1] = pos[1] // if y pos is > the highest y pos so far
            }
        }

        xRange[1]++
        yRange[1]++

        let canv = document.createElement("canvas")
        let ctx = canv.getContext('2d')

        canv.width = xRange[1] - xRange[0]
        canv.height = yRange[1] - yRange[0]
        ctx.drawImage(imgData, -xRange[0], -yRange[0])

        return canv.toDataURL("image/png")
    }

    getDownloadString() {
        return `${this.formName()}_${this.id}`
    }

    async pngExport() {
        let b64data = await this.getDataURL()
        let downloader = document.createElement('a');
        downloader.href = b64data
        downloader.setAttribute("download", `${this.getDownloadString()}.png`);
        document.body.appendChild(downloader);
        downloader.click();
        document.body.removeChild(downloader);
    }

    async copyToClipboard() {
        let b64data = await this.getDataURL()
        let blob = await fetch(b64data).then(res => res.blob())
        if (typeof ClipboardItem == "undefined") return alert("Clipboard copying is not supported on this browser! :(")
        let item = new ClipboardItem({ [blob.type]: blob });
        navigator.clipboard.write([item]);
    }

    psdExport() {
        if (!window.agPsd) return appendScript("ag-psd").then(x => this.psdExport())
            
        let glowing = this.isGlowing()
        this.setGlow(true)

        let psd = { width: this.app.stage.width, height: this.app.stage.height, children: [] }
        
        let ic2 = this.secondaryIcon ? this.secondaryIcon.getAllLayers() : []
        let allLayers = this.getAllLayers().concat(ic2)
        let renderer = this.app.renderer
        let complex = this.complex

        function addPSDLayer(layer, parent, sprite) {
            allLayers.forEach(x => x.sprite.alpha = 0)
            layer.sprite.alpha = 255

            let layerChild = { name: layer.colorName, canvas: renderer.extract.canvas(sprite) }
            if (layer.colorType == "g") {
                if (parent.part) layerChild.name = parent.part.name + " glow"
                if (!complex && !glowing) layerChild.hidden = true
            }
            return layerChild
        }

        let diffIcons = [this]
        if (this.secondaryIcon) diffIcons.push(this.secondaryIcon)

        diffIcons.forEach((i, idx) => {
            i.layers.forEach(x => {
                let iconType = (FORM_NAMES[i.form] || i.form)

                let partName = x.part ? x.part.name : (iconType[0].toUpperCase() + iconType.slice(1))
                let folder = {
                    name: partName,
                    children: x.sections.map(layer => addPSDLayer(layer, x, this.sprite)),
                    opened: true
                }
                if (idx == 0) psd.children.push(folder)      // main icon
                else psd.children[0].children.splice(1, 0, folder)    // secondary icon
            })
        })

        if (complex) {
            let glowFolder = { name: "Glow", children: [], opened: true, hidden: !glowing }
            glowFolder.children = this.glowLayers.map(x => addPSDLayer(x.sections[0], x, this.sprite))
            psd.children.unshift(glowFolder)
        }

        allLayers.forEach(x => x.sprite.alpha = 255)
        let output = agPsd.writePsd(psd)
        let blob = new Blob([output]);
        IconRenderer.downloadFile(blob, `${this.getDownloadString()}.psd`)
        this.setGlow(glowing)
    }

    destroy() {
        if (this.ease) this.ease.destroy()
        this.sprite.destroy()
    }
}

class IconPart {
    constructor(renderer, form, id, colors, glow, misc = {}) {

        this.renderer = renderer

        if (colors[1] === 0 && !misc.skipGlow) glow = true // add glow if p1 is black

        let iconPath = `${form}_${IconRenderer.padZero(id)}`
        let partString = misc.part ? "_" + IconRenderer.padZero(misc.part.part) : ""

        let sections = {}
        if (misc.part) this.part = misc.part

        this.sprite = new PIXI.Container();
        this.sections = []

        if (!misc.skipGlow) {
            let glowCol = IconRenderer.getGlowColor(colors)
            let glowPath = `${iconPath}${partString}_glow_001.png`

            if (misc.customFiles) {
                let foundCustomGlow = misc.customFiles[glowPath]
                if (!foundCustomGlow) {
                    alert(`Warning: This icon's glow texture (${glowPath}) could not be found! It will be rendered without a glow layer.`)
                    glowPath = null
                }
            }

            if (glowPath) {
                sections.glow = new IconLayer(this.renderer, glowPath, glowCol, "g", misc.customFiles)
                if (!glow) sections.glow.sprite.visible = false
            }

        }

        if (!misc.onlyGlow) {
            if (form == "bird") { // ufo top
                sections.ufo = new IconLayer(this.renderer, `${iconPath}_3_001.png`, colors["u"] || WHITE, "u", misc.customFiles)
                if (misc.noDome) sections.ufo.sprite.visible = false
            }

            sections.col1 = new IconLayer(this.renderer, `${iconPath}${partString}_001.png`, colors["1"], "1", misc.customFiles)
            sections.col2 = new IconLayer(this.renderer, `${iconPath}${partString}_2_001.png`, colors["2"], "2", misc.customFiles)

            let extraPath = `${iconPath}${partString}_extra_001.png`
            let hasExtra = misc.customFiles ? misc.customFiles[extraPath] : this.renderer.iconFrames[extraPath]
            if (hasExtra) {
                sections.white = new IconLayer(this.renderer, extraPath, colors["w"], "w", misc.customFiles)
            }
        }

        let layerOrder = ["glow", "ufo", "col2", "col1", "white"].map(x => sections[x]).filter(x => x)
        layerOrder.forEach(x => {
            this.sections.push(x)
            this.sprite.addChild(x.sprite)
        })
    }
}

class IconLayer {
    constructor(renderer, path, color, colorType, customFiles) {

        this.renderer = renderer

        let loadedTexture = this.renderer.iconTextures[path]

        if (customFiles) {
            let customPath = customFiles[path];
            if (!customPath) throw new Error(`Could not find texture: ${path}`)
            loadedTexture = customPath.texture
        }

        let loadedOffsets = this.renderer.iconFrames[path]
        if (customFiles) loadedOffsets = customFiles[path].frames

        this.offsets = loadedOffsets || { spriteOffset: [0, 0] }
        this.sprite = new PIXI.Sprite(loadedTexture || PIXI.Texture.EMPTY)
        this.name = path

        this.colorType = colorType
        this.colorName = COLOR_NAMES[colorType]
        this.setColor(color)
        this.applyOffset()

        if (this.offsets.textureRotated) {
            this.sprite.angle = -90
        }
        this.angleOffset = this.sprite.angle

        this.sprite.anchor.set(0.5)
    }

    applyOffset() {
        this.sprite.position.x = Number(this.offsets.spriteOffset[0] || 0)
        this.sprite.position.y = Number(this.offsets.spriteOffset[1] || 0) * -1
    }

    setColor(color) {
        let col = +color
        this.color = IconRenderer.validNum(col, WHITE)
        this.sprite.tint = this.color
    }
}



// Renders <gdicon> elements across GDBrowser
const IconElementRenderer = {
   
    resourcePath: "/api/icons",  // Fetch icon resources from here
    renderer: null,     // IconRenderer
	renderedIcons: {},	// cache rendered icons so they only need to be rendered once

    // helper to detect if a gdicon element is actually visible
    isInViewport: function(element) {
        const rect = element.getBoundingClientRect();
        return (rect.bottom > 0 && rect.top < window.innerHeight);
    },

	// render all unrendered icons
	renderAll: async function(visibleOnly) {
		let iconsToRender = document.querySelectorAll('gdicon:not([rendered]')

        if (visibleOnly) iconsToRender = [...iconsToRender].filter(x => this.isInViewport(x))


		if (iconsToRender.length < 1) return
		
		// initalize anything missing
		if (!this.renderer) {
            let resources = await fetch(this.resourcePath).then((res => res.json())).catch(() => null)
            if (!resources || typeof resources !== "object") throw new Error("Couldn't load icon resources from ") + this.resourcePath

            let app = new PIXI.Application({ view: document.createElement('canvas'), width: 300, height: 300, backgroundAlpha: 0});
            this.renderer = new IconRenderer(app, resources)
        }

		this.buildIconList(iconsToRender)
	},

	// build each icon in this list
	buildIconList: async function(elements) {
		for (let i = 0; i < elements.length; i++) {
			this.buildIcon(elements[i]).then(this.finishIcon).catch(console.error)
		}
	},

	buildIcon: function(icon) {

		return new Promise((res, rej) => {

            const rend = this.renderer
            if (!rend) return rej("Icon renderer not initalized")

			// skip if rendered, otherwise mark as currently rendering
			if (!icon || icon.hasAttribute("rendering")) return res(null)
			else icon.setAttribute("rendering", "")

			// check cache
			let cacheID = icon.getAttribute("cacheID")
			let foundCache = this.renderedIcons[cacheID]
			if (foundCache) {
				return res({ element: icon, name: foundCache.name, dataURL: foundCache.data })
                // cached icons currently do not store the icon sprite, which means they can't become links
                // this functionality isn't needed so it would just take up space
			}

			let colG = +icon.getAttribute('colG')

			let iconConfig = {
				id: +(icon.getAttribute('iconID') || 1),
				form: rend.parseIconForm(icon.getAttribute('iconForm')),
				col1: rend.parseIconColor(icon.getAttribute('col1')),
				col2: rend.parseIconColor(icon.getAttribute('col2')),
				colG: !isNaN(colG) ? rend.parseIconColor(colG) : null,
				glow: icon.getAttribute('glow') == "true"
			}

			let renderedIcons = this.renderedIcons
			this.renderer.loadIconLayers(iconConfig.form, iconConfig.id).then(() => {
                new Icon(rend, iconConfig, async function(iconSprite) {
					let dataURL = await iconSprite.getDataURL()
					let titleStr = `${Object.values(rend.resources.forms).find(x => x.form == iconSprite.form).name} ${iconSprite.id}`
					if (cacheID) renderedIcons[cacheID] = { name: titleStr, data: dataURL }
					res({ element: icon, name: titleStr, dataURL, icon: iconSprite })
				})
            })
		})
	},

	finishIcon: function(data) {

        if (!data) return

		let element = data.element
		let icon = data.icon

		let iconImg = document.createElement("img")
		iconImg.title = data.name
		iconImg.src = data.dataURL

		element.setAttribute("rendered", "")
		element.removeAttribute("rendering")

		// safety check to make sure children weren't already added
		if (element.childElementCount > 0) return;

		// clickable icon link
		if (icon && element.hasAttribute("linked")) {

			let params = [
				`id=${icon.id}`,
				`col1=${element.getAttribute('col1')}`,
				`col2=${element.getAttribute('col2')}`
			]
			if (icon.form != "player") params.splice(1, 0, `form=${icon.formName()}`)
			if (icon.glow) params.push("glow=1")
			if (icon.colors["g"] != icon.colors["2"]) params.push(`colG=${element.getAttribute('colG')}`)
            
            let hasCube = element.getAttribute("cubeID")
            if (hasCube && CUBE_OFFSETS[icon.form]) params.push(`cube=${hasCube}`)

			let iconLink = document.createElement("a")
			iconLink.classList.add("gdButton")
			iconLink.target = "_blank"
			iconLink.href = `/iconkit?${params.join("&")}`
			iconLink.appendChild(iconImg)
			element.appendChild(iconLink)
		}
		else element.appendChild(iconImg)
	}
}

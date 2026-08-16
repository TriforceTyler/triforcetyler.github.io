const layerList = $('#devIconLayers')

const devStuff = {
    ready: false,
    layerPath: [],
    selectedLayer: null,
    isSecondary: false,

    customPlist: null,
    customSheet: null,
    customIcon: {}
}

function hideLayerSettings() {
    $('.noLayerSelected').show()
    $('.yesLayerSelected').hide()
}

function showLayerSettings() {
    $('.noLayerSelected').hide()
    $('.yesLayerSelected').show()
}

function getDevIcon() {
    return devStuff.isSecondary ? icon.secondaryIcon : icon
}

function refreshDevTools(secondary) {
    devStuff.layerPath = []
    devStuff.selectedLayer = null
    devStuff.ready = true
    devStuff.isSecondary = !!secondary && icon.secondaryIcon

    hideLayerSettings()

    let layers = listIconLayers()
    if (devStuff.layerPath.length < 1 && (layers.length <= 1 || layers[1].isSecondary)) {
        devStuff.layerPath = [0]
        displayIconLayers()
    }
    else displayIconLayers(layers)
}

function updateDevTools() {
    devSelectLayer()
}

function displayIconLayers(layers=listIconLayers()) {
    if (!devStuff.isSecondary && devStuff.layerPath.length < (getDevIcon().complex ? 1 : 2)) $('#backOneLayer').hide()
    else $('#backOneLayer').show()

    $('.devLayerBtn[idx]').remove()
    layers.forEach((x, y) => {
        layerList.append(`<button class="longButton devLayerBtn gdButton${x.selected ? " selectedLayer" : ""}" idx="${y}" layerType="${x.type}"${x.isSecondary ? ' secondary="true"' : ''}>${x.type == "group" ? "📁 " : ""}${x.name.replace("_001.png", "")}</button>`)
    })
}

function getCurrentLayerGroup() {
    let searchGroup = getDevIcon().getLayerArr()
    devStuff.layerPath.forEach(p => {
        searchGroup = searchGroup[p].sections
    })
    return searchGroup
}

function listIconLayers() {
    let layers = []
    let isBase = devStuff.layerPath.length < 1
    let searchGroup = getCurrentLayerGroup()
    searchGroup.forEach(x => {
        if (!x) return; // if no glow, or some other issue
        else if (x.sections) layers.push({ type: "group", name: x.part ? x.part.name : (isBase ? "Icon" : "Group") })
        else if (x.offsets) layers.push({ type: "sprite", name: x.name, selected: x == devStuff.selectedLayer })
    })
    if (!devStuff.isSecondary && icon.secondaryIcon) layers.push({ type: "group", name: "Icon", isSecondary: true })
    return layers
}

$(document).on('click', '.devLayerBtn', function () {
    let idx = parseInt($(this).attr("idx"))
    if (isNaN(idx)) return

    if ($(this).attr('secondary')) {
        return refreshDevTools(true)
    }

    let isGroup = $(this).attr("layertype") == "group";
    let layerName;
    if (isGroup) {
        layerName = listIconLayers()[idx].name
        devStuff.layerPath.push(idx)
        displayIconLayers()
    }

    let foundLayer = !isGroup ? getCurrentLayerGroup()[idx] : getDevIcon().getLayerArr()[idx]
    if (!foundLayer || (foundLayer.part && !foundLayer.sprite)) return

    devStuff.selectedLayer = foundLayer
    $('.devLayerBtn.selectedLayer').removeClass('selectedLayer')

    if (!isGroup) {
        $(this).addClass('selectedLayer')
    }
    else foundLayer.layerName = layerName

    devSelectLayer()
})

$('#backOneLayer').click(function() {
    if (devStuff.isSecondary) return refreshDevTools(false)

    devStuff.layerPath.pop()
    displayIconLayers()
})

function devSelectLayer(layer=devStuff.selectedLayer) {
    if (!layer) return hideLayerSettings()
    devUpdateColor()
    devUpdateOffset()
    $('#devToggleVisible').prop("checked", layer.sprite.visible)
    showLayerSettings()
}

$('#devToggleVisible').click(function() {
    if (!devStuff.selectedLayer) return
    let spr = devStuff.selectedLayer.sprite
    spr.visible = !spr.visible
    $('#devToggleVisible').prop("checked", spr.visible)
})

function devUpdateColor() {
    if (devStuff.selectedLayer.part) {
        return $('#devColorConfig').hide()
    }

    let hex = toHexCode(devStuff.selectedLayer.color)
    $('#devColor img').css('background-color', hex)
    $('#devColorPicker').val(hex)
    $('#devColorConfig').show()
}

$("#devColorPicker").on('input change', function() {
    let newCol = parseInt($('#devColorPicker').val().slice(1), 16)
    devStuff.selectedLayer.setColor(newCol)
    devUpdateColor()
})

function devUpdateOffset() {

    // group
    if (devStuff.selectedLayer.part) {
        $('#spriteOffsetHeader').text("Group Offset")
        $('#devSettingsHeader').text(devStuff.selectedLayer.layerName)
        $('#spriteOffsetX').val(devStuff.selectedLayer.sprite.x)   
        $('#spriteOffsetY').val(devStuff.selectedLayer.sprite.y)   
        return;
    }

    // individual
    let offsets = devStuff.selectedLayer.offsets.spriteOffset
    $('#spriteOffsetHeader').text("Sprite Offset")
    $('#devSettingsHeader').text("Settings")
    $('#spriteOffsetX').val(Number(offsets[0] || 0))   
    $('#spriteOffsetY').val(Number(offsets[1] || 0))   
}

$('#spriteOffsetX, #spriteOffsetY').on('input', function(e) {
    let val = Number($(this).val())
    if (isNaN(val)) return

    let idx = (e.target.id == "spriteOffsetX") ? 0 : 1

    // group
    if (devStuff.selectedLayer.part) {
        devStuff.selectedLayer.sprite[idx == 0 ? "x" : "y"] = val
        return;
    }

    // individual
    devStuff.selectedLayer.offsets.spriteOffset[idx] = Number(val)
    devStuff.selectedLayer.applyOffset()
})

$('.customUploader').on('click', function() {
    $(`#${$(this).attr("target")}`).click()
})

$('.droppable').on('dragover dragenter', function (e) {
    $(this).addClass('dragOver')
    e.preventDefault();
})

$('.droppable').on('dragleave dragend drop', function (e) {
    $(this).removeClass('dragOver')
    e.preventDefault();
})

function setSelectedFile(input, file) {
    let dt = new DataTransfer()
    dt.items.add(file)
    input.prop("files", dt.files)
    input.trigger("change")
}

$('.droppable').on('drop', function (e) {
    if (e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files.length) {
        e.preventDefault();
        let foundPNG;
        let foundPlist;

        Array.from(e.originalEvent.dataTransfer.files).forEach(x => {
            let name = x.name.toLowerCase()
            if (!foundPNG && x.type == "image/png" || name.endsWith(".png")) foundPNG = x;
            else if (!foundPlist && (name.endsWith(".plist") || name.endsWith(".xml"))) foundPlist = x;
        })

        if (foundPNG) setSelectedFile($("#devUploadPNG"), foundPNG)
        if (foundPlist) setSelectedFile($("#devUploadPLIST"), foundPlist)

        return;
    }
});

$('#devUploadPNG').on('change', async function() {
    let file = $(this).prop('files')[0]
    if (!file) return
    else if (file.type != "image/png") return alert("Please upload a valid .PNG image!")
    let reader = new FileReader()
    reader.onload = function(e) {
        let img = new Image()
        img.src = e.target.result
        devStuff.customSheet = new PIXI.Texture(new PIXI.BaseTexture(img))
        $('#devViewPNG p').text(file.name)
        checkCanUpload()
    }
    reader.readAsDataURL(file)
})

$('#devUploadPLIST').on('change', async function() {
    let file = $(this).prop('files')[0]
    if (!file) return
    let reader = new FileReader()
    reader.onload = function(e) {
        let text = e.target.result
        try {
            let parsed = parsePlist(text)
            if (Object.keys(parsed).length < 1) throw "No frames"
            devStuff.customPlist = parsed
            $('#devViewPLIST p').text(file.name)
            return checkCanUpload()
        }
        catch(e) {
            return alert("Parsing error! Make sure you uploaded a valid .plist file. (XML format)")
        }
    }
    reader.readAsText(file)
})

function checkCanUpload() {
    $('#devLoadIcon').prop('disabled', !devStuff.customSheet || !devStuff.customPlist)
}

let iconbox2;
function pinReferenceIcon(xOffset=0, yOffset=0) {
    if (!iconbox2) {
        iconbox2 = $('#result').clone()
        iconbox2.css("z-index", "-10")
        iconbox2.attr("id", "referenceIcon")
        iconbox2.insertAfter('#result')
    }

    icon.getDataURL().then(data => {
        iconbox2.css("margin-left", (-150 + xOffset) + "px")
        let canv = iconbox2[0]
        let ctx = canv.getContext('2d')
        ctx.clearRect(0, 0, 1000, 1000)
        let img = new Image();
        img.src = data
        img.onload = () => { ctx.drawImage(img, (canv.width - img.width) / 2, ((canv.height - img.height) / 2) - yOffset) }
    })
}

$('#devLoadIcon').click(function() {
    if (!devStuff.customSheet || !devStuff.customPlist) return

    if ($('#devViewPLIST p').text().split(".")[0] != $('#devViewPNG p').text().split(".")[0]) {
        if (!confirm("The .png and .plist names don't match! Continue anyways?")) return
    }

    devStuff.customIcon = {}

    // just wrap it in a try catch^tm. if you use shitty plists that's on you
    try {
        readIconData(devStuff.customSheet, devStuff.customPlist.pos, () => {
            $('#extraInfo').hide()
            let keys = Object.keys(devStuff.customIcon)
            let formSample = keys.find(x => x.endsWith(".png")) || keys[0]
            let isBall = formSample.startsWith("player_ball_")
            
            if (isBall) formSample = formSample.replace("player_ball_", "playerball_")

            let formSplit = formSample.split("_001.png")[0].split("_")

            let customID = parseInt(formSplit[1])
            if (isNaN(customID)) {
                if (!confirm("The ID for this object was not found! Continue anyways? (things might break)")) return
                customID = formSplit[1]
            }

            let form = formSplit[0]
            if (isBall) form = "player_ball"

            let foundForm = formNames[form] || form
            if (!forms.includes(foundForm)) {
                if (!confirm("The type for this icon or object was not found! Continue anyways? (will default to cube and things will likely break)")) return
                form = "player"
            }

            let iconFiles = {}
            Object.keys(devStuff.customIcon).forEach(x => {
                iconFiles[x] = { frames: devStuff.customPlist.frames[x], texture: devStuff.customIcon[x] }
            })

            let iconQuality = $('#devUploadQuality').val() || 'uhd'

            try {
                
                let customIcon = new Icon({
                    files: iconFiles, id: customID, form: form, app, isCustom: true, quality: iconQuality,
                    col1: parseIconColor(selectedCol[1]),
                    col2: parseIconColor(selectedCol[2]),
                    colG: parseIconColor(selectedCol.g),
                    glow: enableGlow
                })

                selectedForm = foundForm
                handleNewIcon(customIcon)
    
            }
            catch(e) {
                console.error(e)
                alert("Error: " + e.message)
            }
   
        }, devStuff.customIcon)
    }
    catch(e) {
        console.error(e)
        alert("Error loading object or icon idk\n" + e)
    }

})

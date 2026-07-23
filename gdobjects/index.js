const express = require('express');
const request = require('request');
const compression = require('compression');
const timeout = require('connect-timeout');
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const app = express();

// important icon stuff
let sacredTexts = {}

fs.readdirSync('./sacredtexts').forEach(x => {
  sacredTexts[x.split(".")[0]] = require("./sacredtexts/" + x)
})

let previewIcons = fs.readdirSync('./premade')
let newPreviewIcons = fs.readdirSync('./newpremade')

let previewCounts = {}
previewIcons.forEach(x => {
  if (x.endsWith("_0.png")) return
  let iconType = sacredTexts.forms[x.split("_")[0]].form
  if (!previewCounts[iconType]) previewCounts[iconType] = 1
  else previewCounts[iconType]++
})
sacredTexts.iconCounts = previewCounts

let newIcons = fs.readdirSync('./newicons')
sacredTexts.newIcons = []
let newIconCounts = {}
newIcons.forEach(x => {
  if (x.endsWith(".plist")) {
    sacredTexts.newIcons.push(x.split("-")[0])
    let formName = x.split(/_\d/g)[0]
    if (!newIconCounts[formName]) newIconCounts[formName] = 1
    else newIconCounts[formName]++
  }
})
sacredTexts.newIconCounts = newIconCounts

app.get('/api/icons', function(req, res) { 
  res.status(200).send(sacredTexts);
});

// important icon kit stuff
let iconKitFiles = {}
let sampleIcons = require('./misc/sampleIcons.json')
fs.readdirSync('./extradata').forEach(x => {
  iconKitFiles[x.split(".")[0]] = require("./extradata/" + x)
})

iconKitFiles.previewIcons = previewIcons
iconKitFiles.newPreviewIcons = newPreviewIcons

app.get('/api/iconkit', function(req, res) { 
  let sample = [JSON.stringify(sampleIcons[Math.floor(Math.random() * sampleIcons.length)].slice(1))]
  let iconserver = req.isGDPS ? req.server.name : undefined
  res.status(200).send(Object.assign(iconKitFiles, {sample, server: iconserver, noCopy: req.onePointNine || req.offline}));
});

app.get('/icon/:text', function(req, res) {
  let iconID = Number(req.query.icon || 1)
  let iconForm = sacredTexts.forms[req.query.form] ? req.query.form : "tab1"
  let iconPath = `${iconForm}_${iconID}.png`
  let fileExists = iconKitFiles.previewIcons.includes(iconPath)
  if (fileExists) return res.status(200).sendFile(`./premade/${iconPath}`, {root: __dirname })
  else return res.status(200).sendFile(`./premade/${iconForm}_01.png`, {root: __dirname})
})

app.use(function (err, req, res, next) {
  if (err && err.message == "Response timeout") res.status(504).send('Internal server error! (Timed out)')
})

process.on('uncaughtException', (e) => { console.log(e) });
process.on('unhandledRejection', (e, p) => { console.log(e) });

app.listen(app.config.port, () => console.log(`Site online! (port ${app.config.port})`))

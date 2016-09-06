new-website
===========

Website of https://cdnjs.com, for the cdn content, see [cdnjs/cdnjs](https://github.com/cdnjs/cdnjs) repo.

[![Dependency Status](https://david-dm.org/cdnjs/new-website.svg?theme=shields.io)](https://david-dm.org/cdnjs/new-website) [![Issue Stats](http://www.issuestats.com/github/cdnjs/new-website/badge/pr?style=flat)](http://www.issuestats.com/github/cdnjs/new-website) [![Issue Stats](http://www.issuestats.com/github/cdnjs/new-website/badge/issue?style=flat)](http://www.issuestats.com/github/cdnjs/new-website)

## Dependencies

* [Node](https://nodejs.org)
* [MongoDB](https://mongodb.org)

## Setup

```sh
cd path/to/repo
npm install
```

## Development

```
npm run watch-css
// another tab
node webServer.js
```

## Running

```sh
APP=[mainSite|api]
./runServer.sh
```

 * The artifacts/meta data is on the [meta](https://github.com/cdnjs/new-website/tree/meta) branch.

**Heads up**: `runServer.sh` script only works on Bash. If you're using another shell run `node [webServer|apiServer].js` instead.

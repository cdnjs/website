#!/usr/bin/env node
if (process.env.ENV === 'production') {
  require('newrelic');
}

// Depedencies
const throng = require('throng'),
  gravatar = require('gravatar'),
  GitUrlParse = require("git-url-parse"),
  replaceall = require("replaceall"),
  fs = require('fs'),
  express = require("express"),
  _ = require("lodash"),
  app = express(),
  compress = require('compression'),
  highlight = require('highlight.js'),
  marked = require( "marked" ),
  path = require('path'),
  {logger} = require('./utils/logger');

// Constants

const WORKERS = process.env.WEB_CONCURRENCY || 1;
const PORT = Number(process.env.PORT || 5500);
const TITLE = 'cdnjs.com'

const licenses = JSON.parse(fs.readFileSync(__dirname + '/license-list.json', 'utf8'));


// Load libraries into ram
const {LIBRARIES, LIBRARIES_MAP} = require('./utils/libraries');
logger.info('Libraries loaded into memory (to be deprecated)');

// Load templates into ram
const {templates, generatePage} = require('./utils/templates');

highlight.configure({
  tabReplace: '  '
                      // … other options aren't changed
})

// Setup express
// app.use(compress());
// Serve public folder
app.use(express.static(__dirname + '/public', {
    maxAge: 7200 * 1000
}));

app.use(function(req, res, next) {
  res.setHeader('X-Frame-Options', 'deny');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy', "upgrade-insecure-requests; default-src 'unsafe-eval' 'self' *.carbonads.com *.getclicky.com fonts.gstatic.com www.google-analytics.com fonts.googleapis.com cdnjs.cloudflare.com 'unsafe-inline' https: data: ;");
  }
  next();
});

const setCache = function(res, hours) {
    res.setHeader("Cache-Control", "public, max-age=" + 60 * 60 * hours); // 4 days
    res.setHeader("Expires", new Date(Date.now() + 60 * 60 * hours * 1000).toUTCString());
}



const serverPush = function(res, uri) {
  var temp = uri.split('.'), ext = temp[temp.length-1], as = -1;
  switch (ext) {
    case 'js':
      as='script';
      break;
    case 'css':
      as='style';
      break;
    case 'png' :
    case 'jpg' :
    case 'jpeg':
    case 'gif' :
    case 'ico' :
      as='image';
      break;
    case 'xml' :
      as='';
      break;
  }
  if (as != -1) {
    res.append("Link", "<" + uri + ">; rel=preload; as=" + as );
  }
}

function pushAssets(res) {
  serverPush(res, '/css/theme.css');
  serverPush(res, '/css/main.css');
  serverPush(res, '/js/main.js');
}

app.get('/', function(req, res) {
    pushAssets(res);
    serverPush(res, '/img/algolia64x20.png');
    setCache(res, 2);
    res.send(generatePage({
        page: {
            template: templates.home,
            data: {
                packages: LIBRARIES,
                libCount: LIBRARIES.length
            }
        },
        wrapperClass: 'home'
    }));
});

function libraryGitRepoList(library) {
    urls = [];

    if (library.repository === undefined) {
        return null;
    }

    if (library.repository.type === 'git') {
      urls.push({'url': GitUrlParse(library.repository.url).toString("https")});
    }
    library.urls = urls;
    return urls;
}

function librarylicensesList(library) {
    if (library.license == undefined && library.licenses == undefined) {
        return null;
    }
    if (library.license != undefined) {
        library.licenses = [];
        library.licenses[0] = library.license;
        delete library.license;
    }
    for (license in library.licenses) {
        if (typeof(library.licenses[license]) !== 'object') {
            var temp = library.licenses[license];
            library.licenses[license] = {};
            library.licenses[license].type = temp;
            library.licenses[license].url = '#';
        }
        if (licenses.indexOf(library.licenses[license].type) !== -1) {
            library.licenses[license].url = 'https://spdx.org/licenses/' + library.licenses[license].type + '.html';
        }
    }
    return library.licenses;
}

function libraryAssetsList(library, version) {
    return _.map(library.assets, function(assets) {
        if (assets.version === version) {
            assets.selected = 'selected';
        } else {
            assets.selected = '';
        }
        if (assets.gennedFileNames === undefined) {
            var fileArray = [];
            assets.files.map(function(fileName, index) {
                var fileExtension = path.extname(fileName);
                var fileType = fileExtension.substring(1) || 'unknown';

                fileArray.push({"name": fileName, "fileType": fileType});
            });
            assets.files = fileArray;
            assets.gennedFileNames = true;
        }
        return assets;
    });
}

function checkVersion(library, version) {
    return _.find(library.assets, { version: version });
}


function libraryResponse(req, res) {
    setCache(res, 1);
    var libraryRealName = req.params.library,
      libraryName = req.params.library.replace(/\./g, ''),
      library = LIBRARIES_MAP[libraryName],
      srcpath = path.resolve(__dirname, 'tutorials', libraryRealName),
      tutorialPackages = [];
    if(fs.existsSync(srcpath)){
        var directories = fs.readdirSync(srcpath).filter(function(file) {
            return fs.statSync(path.resolve(srcpath, file)).isDirectory();
        });

        var tutorialPackages = _.map(directories, function(tutorial) {
            var tutorialPackage = JSON.parse(fs.readFileSync(path.resolve(srcpath, tutorial, 'tutorial.json'), 'utf8'));
            tutorialPackage.slug = tutorial;
            return tutorialPackage;
        });
    }
    var tutorialsPresent = tutorialPackages.length > 0 ? true : false;
    if(!library) {
        return res.redirect(307, '/#q=' + libraryName);
    }

    if (library.autoupdate && !library.autoupdate.url) {
        library.autoupdate.string = library.autoupdate.type ? library.autoupdate.type + ' autoupdate enabled' : '';
        switch (library.autoupdate.type) {
          case 'npm':
            library.autoupdate.url = 'https://npmjs.com/package/' + library.autoupdate.target;
            break;
          case 'git':
            library.autoupdate.url = GitUrlParse(library.autoupdate.target).toString("https");
            break;
        }
    }
    if (!library.homepage && library.repository && library.repository.type == 'git') {
        library.homepage = GitUrlParse(library.repository.url).toString("https");
    }
    var version = req.params.version || library.version;

    if(!_.find(library.assets, { version: version })) {
        return res.status(404).send(libraryName + ' version not found!');
    }

    var licenses = librarylicensesList(library);
    var assets = libraryAssetsList(library, version);
    if (!library.urls) {
        library.urls = libraryGitRepoList(library);
    }
    console.log(library)
    res.send(generatePage({
        title: libraryName + ' - ' + TITLE,
        page: {
            template: templates.library,
            data: {
                library: library,
                assets: assets,
                licenses: licenses,
                selectedAssets: _.find(assets, {version: version}),
                tutorials: tutorialPackages,
                libraryRealName: libraryRealName,
                tutorialsPresent: tutorialsPresent
            },
            description: LIBRARIES_MAP[library] && LIBRARIES_MAP[library].description
        }
    }));
}

app.get('/libraries/:library/tutorials', function (req, res) {
    var library = req.params.library,
      srcpath = path.resolve(__dirname, 'tutorials', library),

      directories = fs.readdirSync(srcpath).filter(function(file) {
        return fs.statSync(path.resolve(srcpath, file)).isDirectory();
    });

    var tutorialPackages = _.map(directories, function(tutorial) {
        var tutorialPackage = JSON.parse(fs.readFileSync(path.resolve(srcpath, tutorial, 'tutorial.json'), 'utf8'));
        tutorialPackage.slug = tutorial;
        return tutorialPackage;
    });

    setCache(res, 72);
    res.send(generatePage({
        page: {
            template: templates.tutorials,
            title: library + ' tutorials - ' + TITLE,
            data: {
                tutorials: tutorialPackages,
                library: library
            }
        }
    }));
});

app.get('/libraries/:library/tutorials/:tutorial', function (req, res) {
    var library = req.params.library,
      tutorial = req.params.tutorial,

      srcpath = path.resolve(__dirname, 'tutorials', library),
      indexPath = path.resolve(srcpath, tutorial, 'index.md');

    if(!fs.existsSync(indexPath)) {
        return res.status(404).send('Tutorial not found!');
    }

    var tutorialFile = fs.readFileSync(indexPath, 'utf8'),

      directories = fs.readdirSync(srcpath).filter(function(file) {
        return fs.statSync(path.resolve(srcpath, file)).isDirectory();
    });

    var tutorialPackages = _.map(directories, function(tutorial) {
        var tutorialPackage = JSON.parse(fs.readFileSync(path.resolve(srcpath, tutorial, 'tutorial.json'), 'utf8'));
        tutorialPackage.slug = tutorial;
        return tutorialPackage;
    });

    var tutorialPackage = JSON.parse(fs.readFileSync(path.resolve(srcpath, tutorial, 'tutorial.json'), 'utf8')),
      avatar = gravatar.url(tutorialPackage.author.email, {s: '200', r: 'pg', d: '404'}),
      marked = require( "marked" );

    marked.setOptions({
      renderer: new marked.Renderer(),
      gfm: true,
      tables: true,
      breaks: false,
      pedantic: false,
      sanitize: false,
      smartLists: false,
      smartypants: false,
      langPrefix: '',
      //highlight: function (code, lang) {
      //  var language = lang || 'html';
      //  return highlight.highlightAuto(code).value;
      //}
    });

    setCache(res, 72);
    res.send(generatePage({
        title:  tutorialPackage.name + ' - ' + library + ' tutorials - cdnjs.com',
        page: {
            template: templates.tutorial,
            data: {
                tute: marked( tutorialFile ),
                avatar: avatar,
                tutorial: tutorialPackage,
                disqus_shortname: tutorialPackage.disqus_shortname || 'cdnjstutorials',
                disqus_url: tutorialPackage.disqus_url || ('https://cdnjs.com/' + req.originalUrl),
                disqus_id: tutorialPackage.disqus_url || req.originalUrl,
                author: tutorialPackage.author,
                tutorials: tutorialPackages,
                library: library
            }
        }
    }));
});

app.get('/libraries/:library/:version', libraryResponse);

app.get('/libraries/:library', libraryResponse);

app.get('/libraries', function(req, res) {
    setCache(res, 2);

    res.send(generatePage({
        title: 'libraries - ' + TITLE,
        page: {
            template: templates.libraries,
            data: {
                packages: LIBRARIES,
                libCount: LIBRARIES.length
            }
        }
    }));
});
app.get('/cdnjs.cloudflare.com/*', function(req, res) {
  return res.redirect(301, 'https:/' + req.url);
});

app.get('/request-new-lib', function(req, res) {
  return res.redirect(302, 'https://github.com/cdnjs/cdnjs/issues/new?title=%5BRequest%5D%20Add%20_library_name_%20&body=**Library%20name%3A**%20%0A**Git%20repository%20url%3A**%0A**npm%20package%20url(optional)%3A**%20%0A**License(s)%3A**%0A**Official%20homepage%3A**%0A**Wanna%20say%20something?%20Leave%20message%20here%3A**%0A%0A=====================%0ANotes%20from%20cdnjs%20maintainer%3A%0APlease%20read%20the%20README.md%20and%20CONTRIBUTING.md%20document%20first.%0A%0AYou%20are%20welcome%20to%20add%20a%20library%20via%20sending%20pull%20request%2C%0Ait%27ll%20be%20faster%20then%20just%20opening%20a%20request%20issue%2C%0Aand%20please%20don%27t%20forget%20to%20read%20the%20guidelines%20for%20contributing%2C%20thanks!!');
});

app.get('/gitstats', function(req, res) { return res.redirect(301, '/gitstats/cdnjs'); });
app.get('/git_stats', function(req, res) { return res.redirect(301, '/git_stats/cdnjs'); });
app.get('/about', function(req, res) {

    setCache(res, 72);
    res.send(generatePage({
        page: {
            template: templates.about,
            title: 'about - ' + TITLE
        }
    }));
});

app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});


app.listen(PORT, function() {
    console.log("Listening on " + PORT);
});

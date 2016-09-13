const fs = require('fs');
const path = require('path');
const Mustache = require("mustache");
const condenseWhitespace = require('condense-whitespace');
const removeNewline = require('newline-remove');

// move to config
const TITLE = 'cdnjs.com - The best FOSS CDN for web related libraries to speed up your websites!';

const getTemplate = (templateURL, simple) => {
  const template = fs.readFileSync(path.join(__dirname, '..', templateURL), 'utf8');
  return simple ? template : removeNewline(condenseWhitespace(template));
};

// Templates
const templates = {
  layout: getTemplate('templates/layout.html'),
  home: getTemplate('templates/home.html'),
  libraries: getTemplate('templates/libraries.html'),
  library: getTemplate('templates/library.html'),
  login: getTemplate('templates/login.html'),
  register: getTemplate('templates/register.html'),
  profile: getTemplate('templates/profile.html'),
  members: getTemplate('templates/members.html'),
  news: getTemplate('templates/news.html'),
  newsfeed_item: getTemplate('templates/newsfeed_item.html'),
  newsfeed: getTemplate('templates/newsfeed.html'),
  about: getTemplate('templates/about.html'),
  tutorials: getTemplate('templates/tutorials.html', true),
  tutorial: getTemplate('templates/tutorial.html', true),
};

const generatePage = (options) => {
  const layout = options.layout || templates.layout;
  const title = options.title || TITLE;
  const library = options.page.data.library || null;
  const description = (options.page && options.page.description) ? options.page.description + ' - ' + TITLE : TITLE;
  const keywords = (library && library.keywords) || 'CDN,CDNJS,js,css,library,web,front-end,free,open-source,png,plugin,ng,jQuery,angular';
  const page = {
    data: options.page && options.page.data || {},
    template: options.page && options.page.template || 'No content',
  };
  const pageContent = Mustache.render(page.template, page.data);

  const fullContent = Mustache.render(layout, {
    title,
    description: library && (library.name + " - " + library.description),
    page: pageContent,
    keywords,
    url: options.reqUrl,
    wrapperClass: options.wrapperClass || '',
  });

  return fullContent;
};

module.exports = {
  templates,
  generatePage,
};

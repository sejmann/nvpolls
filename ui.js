"use strict";
/*

Delegates should be able to add/override exposed UI methods -- maybe I need to think about Mixens?
TODO: document event delegation
TODO: matched requestAnimfFrame Dom updates (command pattern) 
TODO: Cache DOM values for fast reads, batch read initial values first obj, batch write changes, if new.
TODO: Cache, not just template, but UI, somehow.
*/
function UI(templateId, view, delegate, appendToElem) {
	this._delegate = delegate;
	this._view = view;
	this._init(this, templateId, view, delegate, appendToElem);
	this._ui=this;
}
//LATER: handle ids that aren't templates
//UI.prototype auto-exec function returns the prototype, the function itself basically houses private class members that are closured into the prototype.
UI.prototype = (function () {
	/* Static (ClassLevel) Data Members */
	var templateCache = {};
	var views = [];

	var nodesWithAttr = function (self, attrName) {
		var nodes = [], n = 0;
		self._rootElems.forEach(function (root) {
			//deal with root, itself
			if (root.hasAttribute(attrName)) nodes[n++] = root;

			//now child nodes
			var nl = root.querySelectorAll("[" + attrName + "]");
			for (var i = nl.length; i--; nodes[n++] = nl[i]) {}
		});
		return nodes;
	};

	var forEachNodeWithAttr=function(self,attr,func,split,remove) {
		var nodes = nodesWithAttr(self,attr);
		for(var i=0,l=nodes.length;i<l;i++) {
			var node=nodes[i],val=node.getAttribute(attr);
			//if(remove) { node.removeAttribute(attr);}

			if(split) {
				var subvals=val.split(split);
				for(var j=0,lj=subvals.length;j<lj;j++) {
					var subval=subvals[j];
					if(subval) func(nodes[i],subval);
				}
			}
			else func(nodes[i],val);
		}
	};

	//TODO: ability to create tiered?
	var prepareVars = function (self) {
		forEachNodeWithAttr(self,"vars",function(node,val) {
			node.removeAttribute("vars");

			val.split(/[;,][ \t\n]*/)
				.forEach(function forEachVar(val) {
					var part = val.split("/");
					var units = part[1];
					var kv = part[0].split(/[:=][ \t\n]*/);
					var name = kv[0] || null,
						prop = kv[1] || null;

					if (!prop && node[name] !== undefined) {
						prop = name;
					}

					(function (self, node, name, prop, units) {
						var def;
						if (prop) {
							var props = prop.split("."),
								next = node;
							for (var i=0, l=props.length; i<l && next; i++) {
								node = next;
								prop = props[i];
								next = node[prop];
							}

							if (units) def = {
								get: function getVar() {
									var x=node[prop];
									if (x === "") return null;
									return parseInt(node[prop]);
								},
								set: function setVar(x) {
									if (x === "" || x == null) node[prop] = "";
									else node[prop] = (parseInt(x) || 0) + units;
								}
							};
							else {
								if(typeof next === "function") {
									var boundfunc=next.bind(node);
									def = {
										get: function getVar() {
											return boundfunc;
										}
									};
								}
								else {
									def = {
										get: function getVar() {
											return node[prop];
										},
										set: function setVar(x) {
											node[prop] = x;
										}
									};
								}
							}
						} else def = {
							get: function getNode() {
								return node;
							}
						};
						if(def) Object.defineProperty(self, name, def);
					})(self, node, name, prop, units);
				});
		});
	};

	var attachEvents = function (self) {
		forEachNodeWithAttr(self,"events",function(node,val) {
			node.removeAttribute("events");

			val.split(/;[ \t\n]*/)
				.forEach(function (part) {
					var kv = part.split(/:[ \t\n]*/);
					var name = kv[0] || null;
					var events = kv[1] || name;

					if (name) {
						events.split(/,[ ]*/).forEach(function (evt) {
							(function (self, name, node, evt) {
								node.addEventListener(evt, function (e) {
									if (typeof self[name] === "function") {
										if (self[name](e)===false) {
											e.stopPropagation();
											e.preventDefault();
										}
									}
									else console.error(
										"unimplemented '%s' event handler on %o (%o)",
										name, self, self[name]
									);
								});
							})(self, name, node, evt);
						});
					}
				});
		});
	};

	/*
	ui needs an classes {} with 
	prep classes needs to 

	 */
//TODO: Need to figure out if I should use className or uiProp in classMap
	var prepareClasses = function (self) {
		var classMap=self._classMap={};

		forEachNodeWithAttr(self,"classes",function(node,className) {
			var parts=className.split(/[=:][ ]*/),
				uiProp=parts[0]; className=parts[1];
			if (!className) className=uiProp;

			//console.log("A",uiProp,className,classMap)

			//if(!self.hasOwnProperty(uiProp)) {
			if(!classMap[uiProp]) {
				classMap[uiProp]=[];
				var value=node.classList.contains(className);

				(function (self, classMap, uiProp, className,value) {
					Object.defineProperty(self, uiProp, {
						get: function () {
							return value;
						},
						set: function changeClass(truth) {
							if(truth!=value) {
								value=truth;
								var list=classMap[uiProp];
								if(list) {
									for(var i=0,l=list.length;i<l;i++) {
										if (truth) list[i].classList.add(className);
										else list[i].classList.remove(className);
									}
								}
								else {
									console.error(".%s can't %s %s on %o.",
										truth?"set":"remove",
										uiProp, className,node,classMap
									);
								}
							}
						}
					});
				})(self, classMap, uiProp, className,value);
			}
			//console.log("B",classMap,className,node);
			classMap[uiProp].push(node);

		},/[;, \t\n]+/,true);
	};

/*
How do I prep containers.. Just create a new linked list, 
*/
 	var insertBeforeNode=function(uiview, node) {
 		var roots=uiview._ui._roots,
 			parent=node.parentNode;
		for (var i = 0, l = roots.length; i < l; ++i) {
			parent.insertBefore(roots[i], node);
		}
	};

	var insertAfter=function(item, target, collection, node) {
			var oldC=item._ui._parent;
			if(oldC!=collection) {
				if(oldC) {
					oldC.remove(item._ui._view||item._ui);
					//console.log("removed: ",item._ui.name);
				}
				item._ui._parent=collection;
			}
			if(target) {
				var targetRoots=target._ui._roots,
					targetLast=targetRoots[targetRoots.length-1],
					next=targetLast.nextSibling;
				insertBeforeNode(item, next);
			}
			else {
				var first=node.firstChild;
				if(first) {
					insertBeforeNode(item,first);
				}
				else item.appendWithinNode(node);
			}
	};

	var prepCollections = function(self) {
		var collections=self._collections={_names:[]};

		forEachNodeWithAttr(self,"collection",function(node,name){
			collections._names.push(name);
			var collection=self[name]=collections[name]=new LinkedList();
			collection._parent=self;

			collection.on("added,moved",function addedmoved(evt,items,target) {
				//console.log("item(s) added to collection");
				if(items instanceof Array) {
					for(var i=items.length-1;i>=0;--i) {
						insertAfter(items[i], target, collection, node);
					}
				}
				else {insertAfter(items,target,collection, node);}
			});
			collection.on("removed",function(evt,items){
				//console.log("item(s) %o removed from collection %s",items,name);
			});
		},null,true);
	};

	//this feels a little redundant.  Figure out a better way.
	var isInclusive=function(node) {
		if(node && (node.tagName && node.tagName==="TEMPLATE")) return false;
		if(node && node.hasAttribute && node.hasAttribute("templateparent")) return false;
		return true;
	};

	var isInplace=function(node) {
		if(node && (node.tagName && node.tagName==="TEMPLATE")) return false;
		if(node && node.hasAttribute && node.hasAttribute("template")) return false;
		if(node && node.hasAttribute && node.hasAttribute("templateparent")) return false;
		return true;
	};

	//cache own copy of template (inclusive keeps parent node)
	var cacheTemplate = function (templateId, templateContent, inclusive) {
		//console.log("cacheTemplate", templateId, templateContent, inclusive);
		var tmpl = document.createDocumentFragment();
		var kids;
		
		if(inclusive)  {
				kids=[templateContent];
		}
		else kids=templateContent.childNodes;

		for (var i = 0, l = kids.length; i < l; i++) {
			tmplAwareRecursiveCopy(kids[i], tmpl);
		}

		templateCache[templateId] = tmpl;
		return tmpl;
	};

	//copy node, also processing child templates
	var tmplAwareRecursiveCopy = function (node, parentClone) {
		//console.log("recuriveCopy:",node, parentClone);
		var clone = node.cloneNode(false);
		parentClone.appendChild(clone);
		var kids = node.childNodes;
		for (var i = 0, l = kids.length; i < l; i++) {
			var kid = kids[i];
			if(kid.tagName==="TEMPLATE") {
				cacheTemplate(kid.id, kid.content || kid);	
			}
			else if(kid.hasAttribute && kid.hasAttribute("template")){
				cacheTemplate(kid.id, kid, true);	
			}
			else tmplAwareRecursiveCopy(kid, clone);
		}
	};

	var init = function (self, templateId, view, delegate, appendToElem) {
		var tmpl, inplace=false, inclusive, orig;
		if (!templateId) { //if no supplied id
			//then create a fake template fragment -- can I avoid this?
			tmpl = document.createElement("TEMPLATE");
			tmpl.appendChild(document.createElement("DIV"))
				.setAttribute("vars", "div;style;className;" +
					"height=style.height;width=style.width;hidden");
		} else tmpl = templateCache[templateId];
		var viewId = self._viewId = views.length;
		views[viewId] = self;

		if (view) {
			view._ui = self;
		}

		if (!tmpl) { //if not already cached
			orig = document.getElementById(templateId);
			if(!orig) {
				console.error("template '%s' not found",templateId);
				return null;
			}
			//console.log("orig",orig,templateId,templateCache);
			inclusive=isInclusive(orig);
			inplace=isInplace(orig);
			var origContent = orig.content || orig;
			tmpl = cacheTemplate(templateId, origContent, inclusive);
			if(!inplace) {
				while (orig.lastChild) orig.removeChild(orig.lastChild);
				orig.parentNode.removeChild(orig);
			}
		}
		
		if(appendToElem!==null) {
			var parent = appendToElem || document.body;

			var kids = inplace?[orig]:tmpl.childNodes,
				kid, root,
				roots = self._roots = [],
				rootElems = self._rootElems = [];

			//insert template into target location
			for (var i = 0, j = 0, l = kids.length; i < l; i++) {
				kid = kids[i];
				root = inplace?kid:parent.appendChild(kid.cloneNode(true));
				if (root instanceof HTMLElement) {
					rootElems[j++] = root;
					root.setAttribute("viewid", viewId);
				}
				roots[i]=root;
			}
			this._firstElem = rootElems[0];
			this._lastElem = rootElems[rootElems.length - 1];
			//console.log(roots)
			prepareVars(self);
			prepareClasses(self);
			prepCollections(self);
			attachEvents(self);
		}
	};

	//safe place to add static class methods 
	UI.getUIFromElement = function (el,filterView) {
		var viewId,ui;
		do {
			if (el instanceof HTMLElement) viewId = el.getAttribute("viewid");
		}
		while (viewId==null && el && (el = el.parentNode));

		ui=views[parseInt(viewId)];

		if(filterView) {
			while(ui && !(ui._view instanceof filterView)) {ui=ui._parent;}
		}

		return ui;
	};


	//LATER: Allow getters as setters to take deep objects?
	/* define public prototype */

	//Returns the actual prototype
	return {
		constructor: UI,

		_init: init,

		set: function (obj) {
			for (var name in obj) {
				var props = name.split("."),
					next = this,
					node, prop;
				for (var i = 0, l = props.length; i < l && next; i++) {
					node = next;
					prop = props[i];
					next = node[prop];
				}

				if (!(node[prop] === undefined)) {
					node[prop] = obj[name];
				} else {
					console.error("'%s': couldn't set %s on %o", name, prop, node);
				}
			}
			return this;
		},

		get: function (names) {
			var vars = {};
			if (typeof (names) === 'string') names = names.split(/[, ]+/);
			for (var i = 0, l = names.length; i < l; ++i) {
				var name = names[i],
					props = names[i].split("."),
					next = this,
					node, prop;
				for (var j = 0, lj = props.length; j < lj && next; j++) {
					node = next;
					prop = props[j];
					next = node[prop];
				}

				if (!(node[prop] === undefined)) {
					vars[name] = node[prop];
				} else {
					console.error("'%s': couldn't get %s on %o", name, prop, node);
				}
			}
			return vars;
		},


		//TODO: add Corner support to withinEdges
		withinEdges: function (pageX, pageY, t, r, b, l, corner) {
			t = (t === undefined) ? 10 : t;
			var first      = this._firstElem,
				pos        = this.getPosition(),
				width      = pos.width  = first.offsetWidth,
				height     = pos.height = first.offsetHeight;
			pos.right  = pos.pageX+width;
			pos.bottom = pos.pageY+height;
				
			var	top = pageY < (pos.pageY + t),
				left = pageX < (pos.pageX + (l || t)),
				right = pageX > (pos.right - (r || t)),
				bottom = pageY > (pos.bottom - (b || t)),
				topleft,
				topright,
				bottomleft,
				bottomright,
				any = top || right || left || bottom;

			var res = {
				orig: pos,
				any: any,
				top: top,
				left: left,
				right: right,
				bottom: bottom,
				topLeft: top && left,
				topRight: top && right,
				bottomLeft: bottom && left,
				bottomRight: bottom && right,
				name: any ? ((top ? "top" : "") + (bottom ? "bottom" : "") +
					(left ? "left" : "") + (right ? "right" : "")) : "none"
			};
			//console.log(res.name);
			return res;
		},

		getPosition:function() {
			var styles = window.getComputedStyle(this._firstElem),
				pos      = styles.position,
				mTop     = parseInt(styles.marginTop)||0,
				mLeft     = parseInt(styles.marginLeft)||0,
				fixed    = (pos === "fixed"),
				absolute = (pos === "absolute"),
				first    = this._firstElem,
				elem     = first,
				pageX    = -mLeft, 
				pageY    = -mTop,
				left, clientX, clientY, absoluteX, absoluteY, parent;
				
			for(;elem&&elem!=document.body; elem=elem.offsetParent) {
				left=elem.offsetLeft;
				if (!isNaN(left)) {
					pageX += left;
					pageY += elem.offsetTop;
				}
			};

			if(absolute||fixed) { elem = first.offsetParent; }
			else { elem = first; }
			
			for(;elem&&elem!=document.body;elem=elem.parentNode)  {
				left=elem.scrollLeft;
				if (!isNaN(left)) {
					pageX -= left;
					pageY -= elem.scrollTop;
				}
			};

			if(fixed) {
				clientX = pageX; clientY = pageY;
				pageX   = clientX + window.scrollX;
				pageY   = clientY + window.scrollY;
			}
			else {
				clientX = pageX - window.scrollX;
				clientY = pageY - window.scrollY;
			}

			return {
				pageX: pageX, pageY: pageY,
			 	clientX: clientX, clientY: clientY,
			 };
		},

		get uiHeight() { //may not be valid for uncontained
			return this._firstElem.offsetHeight;
		},
		set uiHeight(h) { //only works on first element
			if(h==null) this._firstElem.style.height="";
			else if (isFinite(h)) this._firstElem.style.height = h + "px";
			else this._firstElem.style.height = h;
		},

		get uiWidth() {
			return this._firstElem.offsetWidth;
		},
		set uiWidth(w) {
			if(w==null) this._firstElem.style.width ="";
			else if (isFinite(w)) this._firstElem.style.width = w + "px";
			else this._firstElem.style.width = w;
		},

		appendWithinNode: function(parent) {
			var roots=this._roots;
			for (var i = 0, l = roots.length; i < l; ++i) {
				parent.appendChild(roots[i]);
			}
		},

		toString: function () {
			return this._firstElem.textContent.substring(0,20);
		},
		inspect: function(){
			return this.toString();
		},

		//TODO: Create detach() function for ui

		/*
		
		Q: is it okay if _containers is visible on the object?  Yes I think so.
		N: Okay, a view exposes it's UI object, so it can be added safely.

		*/

	};
})();


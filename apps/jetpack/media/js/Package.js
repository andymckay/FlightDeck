/*
 * File: jetpack.Package.js
 */

/*
 * Javascript Package/PackageRevision representation
 */

var Package = new Class({
	// this Class should be always extended
	Implements: [Options],
	options: {
		// data
			// package specific
				// id_number: '',
				// full_name: '',
				// name: '',
				// description: '',
				// type: '', // 'a'/'l'
				// package_author: '',
				// url: '',
				// license: '',
				// package_version_name: '',
				// version_url: '', // link to the current version revision
				// latest_utl: '', // link to the latest revision
			// revision specific data
				// revision_verion_name: '',
				// revision_number: '',
				// message: '', // commit message
				// dependecies: [], // list of names and urls
				// origin_url: '', // link to a revision used to created this one
				// revision_author: '',
				// modules: [], // a list of module filename, author pairs
		attachments: [],
		readonly: false,
		package_info_el: 'package-properties',
		copy_el: 'package-copy',
		test_el: 'try_in_browser'
	},
	modules: {},
	attachments: {},
	initialize: function(options) {
		this.setOptions(options);
		this.instantiate_modules();
		this.instantiate_attachments();
		$('revisions_list').addEvent('click', this.show_revision_list);

		// testing
		this.boundTestAddon = this.testAddon.bind(this);
		if (this.isAddon()) {
			this.test_url = $(this.options.test_el).get('href');
			$(this.options.test_el).addEvent('click', this.boundTestAddon)
		}
		this.copy_el = $(this.options.copy_el)
		if (this.copy_el) {
			this.copy_el.addEvent('click', this.copyPackage.bind(this));
		}
	},
	/*
	 * Method: copyPackage
	 * create a new Package with the same name for the current user
	 */
	copyPackage: function(e) {
		e.stop();
		if (!settings.user) {
			fd.alertNotAuthenticated();
			return;
		}
		new Request.JSON({
			url: this.options.copy_url,
			onSuccess: function(response) {
				window.location.href = response.view_url;
			}
		}).send();
	},
	testAddon: function(e){
		var el;
		if (e) e.stop();
		if (fd.alertIfNoAddOn()) {
			if (e) {
				el = e.target;
			} else {
				el = $(this.options.test_el);
			}
			if (el.getParent('li').hasClass('pressed')) {
				fd.uninstallXPI(el.get('rel'));
			} else {
				this.installAddon();
			}
		} else {
			fd.whenAddonInstalled(function() {
				fd.message.alert(
					'Add-on Builder Helper',
					'Now that you have installed the Add-ons Builder Helper, loading the add-on into your browser for testing...'
				);
				this.testAddon();
			}.bind(this));

		}
	},
	installAddon: function() {
		new Request.JSON({
			url: this.test_url,
			data: this.data || {},
            useSpinner: true,
            spinnerTarget: $(this.options.test_el).getParent('div'),
			onSuccess: fd.testXPI.bind(fd)
		}).send();
	},
	isAddon: function() {
		return (this.options.type == 'a');
	},
	instantiate_modules: function() {
		// iterate by modules and instantiate Module
		var main_module;
		this.options.modules.each(function(module) {
			module.readonly = this.options.readonly;
			if (!main_module) {
				module.main = true;
				main_module = module;
			}
			this.modules[module.filename] = new Module(this,module);
		}, this);
	},
	instantiate_attachments: function() {
		// iterate through attachments
		this.options.attachments.each(function(attachment) {
			attachment.readonly = this.options.readonly;
			this.attachments[attachment.uid] = new Attachment(this,attachment);
		}, this);
	},
	show_revision_list: function(e) {
		if (e) e.stop();
		new Request({
			url: settings.revisions_list_html_url,
			onSuccess: function(html) {
				fd.displayModal(html);
			}
		}).send();
	}
});

var File = Class({
	destroy: function() {
		// refactor me
		if (this.textarea) this.textarea.destroy();
		this.trigger.getParent('li').destroy();
		$('attachments-counter').set('text', '('+ $(this.options.counter).getElements('.UI_File_Listing li').length +')')
		this.on_destroy();
		delete fd.editor_contents[this.get_editor_id()];
		if (this.active) {
			// switch editor!
			mod = null;
			// try to switch to first element
			first = false;
			$each(fd.getItem().modules, function(mod) {
				if (!first) {
					first = true;
					mod.switchBespin();
					mod.trigger.getParent('li').switch_mode_on();
				}
			});
			if (!first) {
				fd.cleanBespin();
			}
		}
	},
	switchBespin: function() {
		if (!fd.editor_contents[this.get_editor_id()]) {
			this.loadCode();
		}
		fd.switchBespinEditor(this.get_editor_id(), this.options.type);
		if (fd.getItem()) {
			$each(fd.getItem().modules, function(mod) {
				mod.active = false;
			});
		}
		this.active = true;
	},
	get_editor_id: function() {
		if (!this._editor_id)
			this._editor_id = this.get_css_id() + this.options.code_editor_suffix;
		return this._editor_id;
	},
	get_trigger_id: function() {
		if (!this._trigger_id)
			this._trigger_id = this.get_css_id() + this.options.code_trigger_suffix;
		return this._trigger_id;
	},
});

var Attachment = new Class({
	Extends: File,
	Implements: [Options, Events],
	options: {
		code_trigger_suffix: '_attachment_switch', // id of an element which is used to switch editors
		code_editor_suffix: '_attachment_textarea', // id of the textarea
		active: false,
		type: 'js',
		append: false,
		readonly: false,
		counter: 'attachments'
	},
	is_editable: function() {
		return ['css', 'txt', 'js', 'html'].contains(this.options.type);
	},
	initialize: function(pack, options) {
		this.setOptions(options);
		this.pack = pack;
		if (this.options.append) {
			this.append();
		}

		// connect trigger with editor
		if ($(this.get_trigger_id())) {
			this.trigger = $(this.get_trigger_id());
			this.trigger.store('Attachment', this);
			this.editor = new FDEditor({
				element: this.get_editor_id(),
				activate: this.options.main || this.options.executable,
				type: this.options.type,
				readonly: this.options.readonly
			});
			// connect trigger
			this.trigger.addEvent('click', function(e) {
				if (e) e.preventDefault();
				if (this.trigger == e.target) {
					if (this.is_editable()) {
						this.switchBespin();
						this.highlightMenu();
					} else {
						var target = e.target;
						var url = target.get('href');
						var ext = target.get('rel');
						var filename = target.get('text').escapeAll();
						var template_start = '<div id="attachment_view"><h3>'+filename+'</h3><div class="UI_Modal_Section">';
						var template_end = '</div><div class="UI_Modal_Actions"><ul><li><input type="reset" value="Close" class="closeModal"/></li></ul></div></div>';
						var template_middle = 'Download <a href="'+url+'">'+filename+'</a>';
						if (['jpg', 'gif', 'png'].contains(ext)) template_middle += '<p><img src="'+url+'"/></p>';
						this.attachmentWindow = fd.displayModal(template_start+template_middle+template_end);
					}
				}
			}.bind(this));
			if (this.options.active && this.is_editable()) {
				this.switchBespin();
				this.highlightMenu();
			}
			if (!this.options.readonly) {
				// here special functionality for edit page
				var rm_mod_trigger = this.trigger.getElement('span.File_close');
				if (rm_mod_trigger) {
					rm_mod_trigger.addEvent('click', function(e) {
						this.pack.removeAttachmentAction(e);
					}.bind(this));
				}
			}
		}
	},
	highlightMenu: function() {
		var li = this.trigger.getParent('li')
		fd.assignModeSwitch(li);
		li.switch_mode_on();
	},
	loadCode: function() {
		// load data synchronously
		new Request({
			url: this.options.get_url,
			async: false,
			useSpinner: true,
			spinnerTarget: 'editor-wrapper',
			onSuccess: function(text, html) {
				fd.editor_contents[this.get_editor_id()] = text;
			}.bind(this)
		}).send();
	},
	get_css_id: function() {
		return this.options.uid;
	},
	on_destroy: function() {
		delete fd.getItem().attachments[this.options.uid];
	},
	append: function() {
		var html = '<a title="" href="'+ this.options.get_url + '" class="Module_file" id="' + this.get_trigger_id() + '">'+
				'{filename}.{ext}<span class="File_status"></span>'+
				'<span class="File_close"></span>'+
				'</a>';
		var li = new Element('li',{
			'class': 'UI_File_normal',
			'html': html.substitute(this.options)
		}).inject($('add_attachment_div').getPrevious('ul'));
		$('attachments-counter').set('text', '('+ $('attachments').getElements('.UI_File_Listing li').length +')')

		if (this.is_editable()) {
			var textarea = new Element('textarea', {
				'id': this.get_editor_id(),
				'class': 'UI_Editor_Area',
				'name': this.get_editor_id(),
				'html': ''
			}).inject('editor-wrapper');
		}
	}
});

var Module = new Class({
	Extends: File,
	Implements: [Options, Events],
	options: {
		// data
			// filename: '',
			// code: '',
			// author: '',
		// DOM
			code_trigger_suffix: '_switch', // id of an element which is used to switch editors
			code_editor_suffix: '_textarea', // id of the textarea
		readonly: false,
		main: false,
		executable: false,
		active: false,
		type: 'js',
		append: false,
		counter: 'modules'
	},
	initialize: function(pack, options) {
		this.setOptions(options);
		this.pack = pack;
		if (this.options.append) {
			this.append();
		}
		// connect trigger with editor
		if ($(this.get_trigger_id())) {
			this.trigger = $(this.get_trigger_id());
			this.trigger.store('Module', this);
			this.editor = new FDEditor({
				element: this.get_editor_id(),
				activate: this.options.main || this.options.executable,
				type: this.options.type,
				readonly: this.options.readonly
			});
			// connect trigger
			this.trigger.addEvent('click', function(e) {
				if (e) e.preventDefault();
				this.switchBespin();
			}.bind(this));
			if (this.options.main || this.options.executable) {
				this.trigger.getParent('li').switch_mode_on();
			}
			if (this.options.active) {
				this.switchBespin();
				var li = this.trigger.getParent('li')
				fd.assignModeSwitch(li);
				li.switch_mode_on();
			}
                        if (!this.options.readonly) {
                               // here special functionality for edit page
                               var rm_mod_trigger = this.trigger.getElement('span.File_close');
                               if (rm_mod_trigger) {
                                       rm_mod_trigger.addEvent('click', function(e) {
                                               this.pack.removeModuleAction(e);
                                       }.bind(this));
                               }
			}
		}
	},
	loadCode: function() {
		// load data synchronously
		new Request.JSON({
			url: this.options.get_url,
			async: false,
			useSpinner: true,
			spinnerTarget: 'editor-wrapper',
			onSuccess: function(mod) {
				fd.editor_contents[this.get_editor_id()] = mod.code;
			}.bind(this)
		}).send();
	},
	append: function() {
		var html = '<a title="" href="#" class="Module_file" id="{filename}_switch">'+
						'{filename}<span class="File_status"></span>'+
						'<span class="File_close"></span>'+
					'</a>';
		var li = new Element('li',{
			'class': 'UI_File_normal',
			'html': html.substitute(this.options)
		}).inject($('add_module_div').getPrevious('ul'));
		$('modules-counter').set('text', '('+ $('modules').getElements('.UI_File_Listing li').length +')')

		var textarea = new Element('textarea', {
			'id': this.options.filename + '_textarea',
			'class': 'UI_Editor_Area',
			'name': this.options.filename + '_textarea',
			'html': this.options.code
		}).inject('editor-wrapper');
	},
	get_css_id: function() {
		return this.options.filename;
	},
	on_destroy: function() {
		delete fd.getItem().modules[this.options.filename];
	},
})

Package.View = new Class({
	Extends: Package,
	Implements: [Options, Events],
	options: {
		readonly: true,
		// copy_url: '',
	},
	initialize: function(options) {
		this.setOptions(options);
		this.parent(options);
		$(this.options.package_info_el).addEvent('click', this.showInfo.bind(this));
	},
	/*
	 * Method: showInfo
	   display a window with info about current Package
	 */
	showInfo: function(e) {
		e.stop();
		fd.displayModal(this.options.package_info);
	},
});


Package.Edit = new Class({
	Extends: Package,
	Implements: [Options, Events],
	options: {
		// DOM elements
			save_el: 'package-save',
			menu_el: 'UI_Editor_Menu',
			assign_library_el: 'assign_library_action',
			assign_library_input: 'library_id_number',
			add_module_el: 'add_module_action',
			add_module_input: 'add_module',

		// urls
			// save_url: '',
			// delete_url: '',
			// add_module_url: '',
			// assign_library_url: '',
			// switch_sdk_url: '',
		package_info_form_elements: [
			'full_name', 'version_name', 'package_description', 'revision_message'
			]
	},
	initialize: function(options) {
		this.setOptions(options);
		// this.data is a temporary holder of the data for the submit
		this.data = {};
		this.parent(options);

		this.assignActions();

		// autocomplete
		this.autocomplete = new FlightDeck.Autocomplete({
			'url': settings.library_autocomplete_url
		});
	},
	assignActions: function() {
		// assign menu items
		this.appSidebarValidator = new Form.Validator.Inline('app-sidebar-form');
		$(this.options.package_info_el).addEvent('click', this.editInfo.bind(this));

		// save
		this.boundSaveAction = this.saveAction.bind(this);
		$(this.options.save_el).addEvent('click', this.boundSaveAction);

		// submit Info
		this.boundSubmitInfo = this.submitInfo.bind(this);

		// add/remove module
		this.boundAddModuleAction = this.addModuleAction.bind(this);
		this.boundRemoveModuleAction = this.removeModuleAction.bind(this);
		$(this.options.add_module_el).addEvent('click',
			this.boundAddModuleAction);

		// assign/remove library
		this.boundAssignLibraryAction = this.assignLibraryAction.bind(this);
		this.boundRemoveLibraryAction = this.removeLibraryAction.bind(this);
		$(this.options.assign_library_el).addEvent('click',
			this.boundAssignLibraryAction);
		$$('#libraries .UI_File_Listing .File_close').each(function(close) {
			close.addEvent('click', this.boundRemoveLibraryAction);
		},this);

		// add attachments
		this.add_attachment_el = $('add_attachment');
		this.add_attachment_el.addEvent('change', this.sendMultipleFiles.bind(this));
		this.boundRemoveAttachmentAction = this.removeAttachmentAction.bind(this);
		$$('#attachments .UI_File_Listing .File_close').each(function(close) {
			close.addEvent('click', this.boundRemoveAttachmentAction);
		},this);
		this.attachments_counter = $('attachments-counter');

		var fakeFileInput = $('add_attachment_fake'), fakeFileSubmit = $('add_attachment_action_fake');
		this.add_attachment_el.addEvents({
			change: function(){
				fakeFileInput.set('value', this.get('value'));
			},

			mouseover: function(){
				fakeFileSubmit.addClass('hover');
			},

			mouseout: function(){
				fakeFileSubmit.removeClass('hover');
			}
		});
		if ($('jetpack_core_sdk_version')) {
			$('jetpack_core_sdk_version').addEvent('change', function() {
				new Request.JSON({
					url: this.options.switch_sdk_url,
					data: {'id': $('jetpack_core_sdk_version').get('value')},
					onSuccess: function(response) {
						// set the redirect data to view_url of the new revision
						fd.setURIRedirect(response.view_url);
						// set data changed by save
						this.setUrls(response);
                        // change url to the SDK lib code
                        $('core_library_lib').getElement('a').set(
                          'href', response.lib_url);
                        // change name of the SDK lib
                        $('core_library_lib').getElement('span').set(
                          'text', response.lib_name);
						fd.message.alert(response.message_title, response.message);
					}.bind(this)
				}).send();
			}.bind(this));
		}
		this.bind_keyboard();
	},

	get_add_attachment_url: function() {
		return this.add_attachment_url || this.options.add_attachment_url;
	},

	sendMultipleFiles: function() {
		self = this;
		self.spinner = false;
		sendMultipleFiles({
			url: this.get_add_attachment_url.bind(this),

			// list of files to upload
			files: this.add_attachment_el.files,

			// clear the container
			onloadstart:function(){
				if (self.spinner) {
				  self.spinner.position();
				} else {
				  self.spinner = new Spinner($('attachments')).show();
				}
			},

			// do something during upload ...
			//onprogress:function(rpe){
			//	$log('progress');
			//},

			onpartialload: function(rpe, xhr) {
				$log('FD: attachment uploaded');
				response = JSON.parse(xhr.responseText);
				fd.message.alert(response.message_title, response.message);
				var attachment = new Attachment(self,{
					append: true,
					active: true,
					filename: response.filename,
					ext: response.ext,
					author: response.author,
					code: response.code,
					get_url: response.get_url,
					uid: response.uid,
					type: response.ext
				});
				self.setUrls(response);
				self.attachments[response.uid] = attachment;
			},

			// fired when last file has been uploaded
			onload:function(rpe, xhr){
				if (self.spinner) self.spinner.destroy();
				$log('FD: all files uploaded');
				$(self.add_attachment_el).set('value','');
				$('add_attachment_fake').set('value','')
			},

			// if something is wrong ... (from native instance or because of size)
			onerror:function(){
				if (self.spinner) self.spinner.destroy();
				fd.error.alert(
					'Error {status}'.substitute(xhr),
					'{statusText}<br/>{responseText}'.substitute(xhr)
		                );
			}
		});
	},
	removeAttachmentAction: function(e) {
		var trigger = e.target.getParent('a'),
		    filename = trigger.get('text'),
		    uid = trigger.get('id').split('_')[0];
		this.question = fd.showQuestion({
			title: 'Are you sure you want to remove "'+filename+'"?',
			message: '',
			ok: 'Remove',
			id: 'remove_attachment_button',
			callback: function() {
				this.removeAttachment(uid);
				this.question.destroy();
			}.bind(this)
		});

	},
	removeAttachment: function(uid) {
		var self = this;
		new Request.JSON({
			url: self.remove_attachment_url || self.options.remove_attachment_url,
			data: {uid: uid},
			onSuccess: function(response) {
				fd.setURIRedirect(response.view_url);
				self.setUrls(response);
				var attachment = self.attachments[uid];
				attachment.destroy();
			}
		}).send();
	},

	addModuleAction: function(e) {
		e.stop();
		if (!this.appSidebarValidator.validate()) return;
		// get data
		var filename = $(this.options.add_module_input).value;
		if (!filename) {
			fd.error.alert('Filename can\'t be empty', 'Please provide the name of the module');
			return;
		}
		if (this.options.modules.contains(filename)) {
			fd.error.alert('Filename has to be unique', 'You already have the module with that name');
			return;
		}
		this.addModule(filename);
	},
	addModule: function(filename) {
		new Request.JSON({
			url: this.add_module_url || this.options.add_module_url,
			data: {'filename': filename},
			onSuccess: function(response) {
				// set the redirect data to view_url of the new revision
				fd.setURIRedirect(response.view_url);
				// set data changed by save
				this.setUrls(response);
				fd.message.alert(response.message_title, response.message);
				// initiate new Module
				var mod = new Module(this,{
					append: true,
					active: true,
					filename: response.filename,
					author: response.author,
					code: response.code,
					get_url: response.get_url
				});
				this.modules[response.filename] = mod;
			}.bind(this)
		}).send();
	},
	removeModuleAction: function(e) {
		e.stop();
		var trigger = e.target.getParent('a');
		var module = trigger.retrieve('Module');
		if (!module) {
			fd.error.alert('Application error', 'Can not associate module to the trigger');
			return;
		}
		this.question = fd.showQuestion({
			title: 'Are you sure you want to remove {filename}.js?'.substitute(module.options),
			message: 'You may always copy it from this revision',
			ok: 'Remove',
			id: 'remove_module_button',
			callback: function() {
				this.removeModule(module);
				this.question.destroy();
			}.bind(this)
		});
	},
	removeModule: function(module) {
		new Request.JSON({
			url: this.remove_module_url || this.options.remove_module_url,
			data: module.options,
			onSuccess: function(response) {
				fd.setURIRedirect(response.view_url);
				this.setUrls(response);
				var mod = this.modules[response.filename];
				mod.destroy();
			}.bind(this)
		}).send();
	},
	assignLibraryAction: function(e) {
        e.stop();
		// get data
		library_id = $(this.options.assign_library_input).get('value');
		// assign Library by giving filename
		this.assignLibrary(library_id);
	},
	assignLibrary: function(library_id) {
        if (library_id) {
          new Request.JSON({
              url: this.assign_library_url || this.options.assign_library_url,
              data: {'id_number': library_id},
              onSuccess: function(response) {
                  // clear the library search field
                  $(this.options.assign_library_input).set('value','');
                  $(this.autocomplete.options.display_el).set('value','');
                  // set the redirect data to view_url of the new revision
                  fd.setURIRedirect(response.view_url);
                  // set data changed by save
                  this.setUrls(response);
                  //fd.message.alert('Library assigned', response.message);
                  this.appendLibrary(response);
              }.bind(this)
          }).send();
        } else {
          fd.error.alert('No such Library', 'Please choose a library from the list');
        }
	},
	appendLibrary: function(lib) {
		var html='<a title="" id="library_{library_name}" href="{library_url}" target="{id_number}" class="library_link">'+
					'{full_name}'+
					'<span class="File_close"></span>'+
				'</a>';
		new Element('li', {
			'class': 'UI_File_Normal',
			'html': html.substitute(lib)
		}).inject($('assign_library_div').getPrevious('ul'));
		$$('#library_{library_name} .File_close'.substitute(lib)).each(function(close) {
			close.addEvent('click', this.boundRemoveLibraryAction);
		},this);
		$('libraries-counter').set('text', '('+ $('libraries').getElements('.UI_File_Listing li').length +')')
	},
	removeLibraryAction: function(e) {
		if (e) e.stop();
		var id_number = e.target.getParent('a').get('target');
		var name = e.target.getParent('a').get('text');

		this.question = fd.showQuestion({
			title: 'Are you sure you want to remove "'+name+'"?',
			message: '',
			ok: 'Remove',
			id: 'remove_library_button',
			callback: function() {
				this.removeLibrary(id_number);
				this.question.destroy();
			}.bind(this)
		});
	},
	removeLibrary: function(id_number) {
		new Request.JSON({
			url: this.remove_library_url || this.options.remove_library_url,
			data: {'id_number': id_number},
			onSuccess: function(response) {
				fd.setURIRedirect(response.view_url);
				this.setUrls(response);
				$('library_{name}'.substitute(response)).getParent('li').destroy();
				$('libraries-counter').set('text', '('+ $('libraries').getElements('.UI_File_Listing li').length +')')
			}.bind(this)
		}).send();
	},
	/*
	 * Method: editInfo
	 * display the EditInfoModalWindow
	 */
	editInfo: function(e) {
		e.stop();
		this.savenow = false;
		fd.editPackageInfoModal = fd.displayModal(settings.edit_package_info_template.substitute(this.data || this.options));
		$('package-info_form').addEvent('submit', this.boundSubmitInfo);

		// XXX: this will change after moving the content to other forms
		$('version_name').addEvent('change', function() { fd.fireEvent('change'); });
		$('full_name').addEvent('change', function() { fd.fireEvent('change'); });
		$('package_description').addEvent('change', function() { fd.fireEvent('change'); });

		if ($('savenow')) {
			$('savenow').addEvent('click', function() {
				this.savenow = true;
			}.bind(this));
		}
		this.validator = new Form.Validator.Inline('package-info_form');
		self = this;
		$$('#package-info_form input[type=submit]').each(function(el) {
			el.addEvent('click', function(e) {
				if (!self.validator.validate()) {
					e.stop();
				}
			});
		});

		// XXX: hack to get the right data in the form
		$each(this.data, function(value, key) {
			if ($(key)) $(key).value = value;
		})
	},
	/*
	 * Method: submitInfo
	 * submit info from EditInfoModalWindow
	 * if $('savenow') clicked - save the full info
	 */
	submitInfo: function(e) {
		e.stop();
		// collect data from the Modal
		this.options.package_info_form_elements.each(function(key) {
			if ($(key)) this.data[key] = $(key).value;
		}, this);
		// check if save should be called
		if (this.savenow) {
			return this.save();
		}
		fd.editPackageInfoModal.destroy();
	},
	collectData: function() {
		fd.saveCurrentEditor();
		$each(this.modules, function(module, filename) {
			this.data[filename] = fd.editor_contents[filename + module.options.code_editor_suffix]
		}, this);
		$each(this.attachments, function(attachment) {
			this.data[attachment.options.uid] = fd.editor_contents[attachment.options.uid + attachment.options.code_editor_suffix]
		}, this);
	},
	testAddon: function(e){
		this.collectData();
		this.data.live_data_testing = true;
		this.parent(e);
	},
	saveAction: function(e) {
		if (e) e.stop();
		this.save();
	},
	save: function() {
		this.collectData();
		this.saving = true;
		new Request.JSON({
			url: this.save_url || this.options.save_url,
			data: this.data,
			onSuccess: function(response) {
				// set the redirect data to view_url of the new revision
				if (response.reload) {
				 	window.location.href = response.view_url;
				}
				fd.setURIRedirect(response.view_url);
				// set data changed by save
				this.setUrls(response);
				fd.message.alert(response.message_title, response.message);
				// clean data leaving package_info data
				this.data = {};
				this.options.package_info_form_elements.each(function(key) {
					if ($defined(response[key])) {
						this.data[key] = response[key]
					}
				}, this);
				if (fd.editPackageInfoModal) fd.editPackageInfoModal.destroy();
				if ($(this.options.test_el).getParent('li').hasClass('pressed')) {
					// only one add-on of the same id should be allowed on the Helper side
					this.installAddon();
				}
				fd.fireEvent('save');
			}.bind(this),
			onFailure: function() {
				this.saving = false;
			}.bind(this)
		}).send();
	},
	bind_keyboard: function() {
		this.keyboard = new Keyboard({
		    defaultEventType: 'keyup',
		    events: {
			'ctrl+s': this.boundSaveAction
		    }
		});
		this.keyboard.activate();
	},
	setUrls: function(urls) {
		this.save_url = urls.save_url;
		this.test_url = urls.test_url;
		this.add_module_url = urls.add_module_url;
		this.remove_module_url = urls.remove_module_url;
		this.add_attachment_url = urls.add_attachment_url;
		this.remove_attachment_url = urls.remove_attachment_url;
		this.assign_library_url = urls.assign_library_url;
		this.remove_library_url = urls.remove_library_url;
	}
});

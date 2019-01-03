import FormAPI from './FormAPI';
import {privates, verifyMethod} from './FormAPI';
// import assert from 'assert';
import validator from 'validate.js';
import axios from 'axios';
// import 'whatwg-fetch';
import qs from 'qs';


const getFormData = (form) => {
	return  Object.entries(form.elements || {}).reduce(toData, {});
};

// TODO add arrays support
const toData = (result = {}, [fieldName, input]) => {

	if (fieldName !== input.name) {
		return result;
	}

	let value = input.value;
	if (input.type === 'checkbox') {
		value = input.checked;
	}

	result[fieldName] = value;
	return result;
};

export default class ClientFormAPI extends FormAPI {
	/**
	 * ClientFormAPI constructor
	 *
	 * @param id {String} Form id
	 * @param options {Object}
	 *
	 * @type {ClientFormAPI}
	 */
	constructor(formElement, options = {}) {
		super(formElement, options);

		const {document} = global;

		// TODO Prevent twice binding

		if (formElement instanceof HTMLFormElement) {
			this.form = formElement;
		} else {
			// assert(typeof formElement === 'string' && formElement.length, 'Form formElement must be a string or HTMLFormElement');
			this.form = document.forms[formElement];
		}

		// assert(this.form, `Form with id ${formElement} is not defined`);
		const setPristine = (status) => {
			this[privates].pristine = status;
			this.emit('dirty', status);
		};
		const setPending = (status) => {
			this[privates].pending = status;
			this.emit('pending', status);
		};

		this.form.addEventListener('input', async (event) => {
			if (this.isPristine) {
				setPristine(false);
			}
			this.emit('input', event);
			this.emit(`input.${event.target.name}`, event);
			const {name} = event.target;
			if (!name || !name.length) {
				return ;
			}
			await this.verifyField(event.target.name, this.options);
		}, true);

		this.form.addEventListener('focus', async (event) => {
			this.emit('focus', event);
			this.emit(`focus.${event.target.name}`, event);
		}, true);

		this.form.addEventListener('change', async (event) => {
			this.emit('change', event);
			this.emit(`change.${event.target.name}`, event);
			if (this.isPristine) {
				setPristine(false);
			}
			const {name} = event.target;
			if (!name || !name.length) {
				return ;
			}
			await this.verifyField(event.target.name);
		}, true);

		this.form.addEventListener('submit', async (event) => {
			const valid = await this.verify();
			if (!valid) {
				this.emit('error', this.errors);
			}

			const makeAjaxSubmit = !(options.submit === false);

			if (makeAjaxSubmit && valid) {
				const axiosInstance = axios.create({
					headers: {
						'Content-Type': this.enctype,
					}
				});

				const requestOptions = {
					method: this.method,
					url: this.url,
				};

				if (this.method === 'get') {
					requestOptions['params'] = this.data;
				} else {
					switch (this.enctype) {
						case 'application/json':
							requestOptions.data = JSON.stringify(this.data);
							break;
						case 'application/x-www-form-urlencoded':
							requestOptions.data = this.toString();
							break;
					}
				}

				axiosInstance
					.request(requestOptions)
					.then((result) => {
						console.log(result);
					})
					.catch((error) => {
						this.setCustomErrors([
							error.message
						]);
					});
			}

			if (event) {
				event.preventDefault();
			}
				const valid = await this.verify();
				if (event) {
					event.preventDefault();
				}
				setPending(true);

			return new Promise((resolve, reject) => {
				let xhr = new XMLHttpRequest();
				xhr.open(this.method, this.action, true);
				xhr.onload = function() {
					if (this.status == 200) {
						resolve(this.response);
						setPending(false);
            this.emit('submit', event);
					} else {
						let error = new Error(this.statusText);
						error.code = this.status;
						reject(error);
						setPending(false);
					} else if (!valid) {
						reject(error);
						this.emit('error', this.errors);
					}
				};

				xhr.onerror = () => {
					reject(new Error('Network Error'));
				};

				xhr.send();
			}).then(
				response => console.log(`OK. Form with ID ${formElement} successfully sended. ${response}`),
				error => console.log(`ERROR — ${error}`);
			);
		});

		this.form.addEventListener('click', async(event) => {
			let target = event.target;
			if (target.tagName.toLowerCase() === 'label') {
				target = this.form.elements[target.htmlFor] || target;
			}
			if (target.type === 'checkbox') {
				setTimeout(async () => {
						this.emit('change', event);
						this.emit(`change.${target.name}`, event);
						if (this.isPristine) {
							setPristine(false);
						}
						await this.verifyField(target.name);
						return;
				}, 0);
			}
		}, true);

		this.form.addEventListener('reset', async(event) => {
			if (!this.isPristine) {
          setPristine(true);
        }
            this[privates].errors = null;
            this.form.reset();
		    this[privates].pristine = true;
            this[privates].pending = false;
		    this.resetCustomErrors();
            setPending(false);
		    this.emit('reset');
		}, true);

		document.addEventListener('DOMContentLoaded', async(event) => {
			setPristine(true);
		}, true);
	}

	get isPristine() {
		return this[privates].pristine;
	}

	get isDirty() {
		return !this[privates].pristine;
	}

	get data() {
		return validator.collectFormValues(this.form);
		// return getFormData(this.form);
	}

	validationFromElements() {
		//TODO Get validation rules from elements
	}

	get element() {
		return this.form;
	}

	get url() {
		return this.form.action;
	}

	get method() {
		return this.form.method || 'GET';
	}

	get action() {
		return this.form.action;
	}

	get enctype() {
		return this[privates].enctype || this.form.enctype;
	}

	get elements() {
		const elements = Array.from(this.form.elements);
		return elements.map((element) => {
			const {name} = element;
			const {errors} = this;
			const rule = this.getRule(name);
			return [
				element,
				name,
				errors ? errors[name] : null,
				rule,
			]
		})
	}

	files(fieldName) {
		const fileList = [];
		const field = this.field(fieldName);
		if (!field) {
			return fileList;
		}
		const fileListExists = 'files' in field;
		if (!fileListExists) {
			return fileList;
		}

		let count = field.files.length;
		while (count--) {
			fileList.push(field.files[count]);
		}

		return fileList.reverse();
	}

	field(fieldName, value, eventType) {
		if (typeof value === 'undefined') {
			return this.form.elements[fieldName];
		}

		const field = this.form.elements[fieldName];
		if (field.type === 'checkbox') {
			field.checked = !!value;
		} else {
			field.value = value;
		}



		if (!eventType) {
			let inputEvent = new Event('input');
			field.dispatchEvent(inputEvent);

			let changeEvent = new Event('change');
			field.dispatchEvent(changeEvent);

		} else {
			let changeEvent = new Event(eventType);
			field.dispatchEvent(changeEvent);
		}

		return field;
	}

	/**
	 * Method sets focus on the form's elements
	 * @example
	 * 	const currentForm = new ClientFormAPI('login');
	 * 	currentForm.focus(); //Focuses on the first element of the form
	 *
	 * @type {ClientFormAPI}
	 */
	focus(elementId = 0) {
		const currentElement = this.form.elements[elementId];
		if (currentElement) {
			currentElement.focus();
		}

		return this;
	}
}

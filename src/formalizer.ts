import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
  RefObject
} from 'react';

/*
The validation object has a validation rule per key whose value has the following format:
{
    customValidator: {
        errorMessage: string,
        validator: function (provided only if a custom validation function is needed/desired)
    }
}

For built in validators, the value can simply be the desired error message:
{
    isRequired: "This field is required"
}

Alternatively, you may provide error messages to be used with all validators of a given type. To do that, set each
validator as a key on the GlobalValidators object:

GlobalValidators.startsWithLetterZ = {
    errorMessage: "Must start with the letter Z",
    validator: (value) => value && value.length > 0 && value.charAt(0).toLowerCase() === 'z';
};

ValidatorSettings = {
    invalidAttr: { error: true },
    invalidHelperTextAttr: undefined
}
*/

// apparently can't import a type from an optional dependency, so use "any" until this is resolved.
// https://stackoverflow.com/questions/52795354/how-to-use-a-type-from-an-optional-dependency-in-a-declaration-file
// https://stackoverflow.com/questions/55041919/import-of-optional-module-with-type-information
let validator: any = void 0;

interface ValidatorSettingsType {
  invalidAttr?: { [key: string]: any };
  invalidHelperTextAttr?: string;
}

export const ValidatorSettings: ValidatorSettingsType = {
  invalidAttr: { error: true },
  invalidHelperTextAttr: undefined
};

export const GlobalValidators: {
  [key: string]: InputValidationConfig | string;
} = {
  isRequired: 'This field is required.'
};

export const DEFAULT_VALIDATION_ERROR_MESSAGE = 'This field is not valid.';

type ValidatorFunction = (value: any, options: Options) => boolean;

interface InputValidationConfig {
  errorMessage?: string;
  negate?: boolean;
  options?: Options;
  validator?: ValidatorFunction;
}

interface FormData {
  [key: string]: any;
}

type FormSubmitHandler = (
  e: Event,
  formValues: { [ley: string]: any }
) => boolean;

interface InputValidationByKey {
  [key: string]: InputValidationConfig | string;
}

type InputValidation = InputValidationByKey | string;

type ValidationErrorUpdater = (
  name: string,
  unmetRuleKey?: string,
  errorMessage?: string
) => void;

interface FormInputParams {
  name: string;
  formHandler: [FormData, Dispatch<SetStateAction<FormData>>];
  updateError: ValidationErrorUpdater;
  invalidAttr?: object;
  validation: InputValidation[];
  helperTextAttr?: string;
}

interface InputAttributes {
  value: any;
  name: string;
  onChange: (e: FormEvent<HTMLInputElement>) => any;
  onBlur: () => any;
  helperTextObj?: { [key: string]: string };
  invalidAttr?: object;
}

interface Options {
  [key: string]: any;
  formData: { [key: string]: string };
}

export const mustMatch = (
  fieldName: string
): { [key: string]: InputValidationConfig } => ({
  mustMatchField: {
    errorMessage: `Must match the ${fieldName} field.`,
    validator: (value: string, options: Options) =>
      value === options.formData[fieldName]
  }
});

export const useFormInput = ({
  name,
  formHandler,
  validation = [],
  updateError,
  invalidAttr = {},
  helperTextAttr
}: FormInputParams): InputAttributes => {
  const [formData, setFormData] = formHandler;
  const formValue = formData[name] || '';

  const [value, setValue] = useState(formValue);
  const [isValid, setIsValid] = useState(true);
  const [isTouched, setIsTouched] = useState(false);
  const [helperText, setHelperText] = useState<string | undefined>(void 0);

  const handleValidation = useCallback(
    (inputValue: any) => {
      const validationToProcess =
        typeof validation === 'string' ||
        (typeof validation === 'object' && !Array.isArray(validation))
          ? [validation]
          : validation;

      if (!Array.isArray(validationToProcess)) {
        throw new Error(
          'Formalizer: the validator value passed into useInput must be a single string, a single object or an array.'
        );
      }

      for (const v of validationToProcess) {
        let validationConfig: InputValidationByKey | undefined = void 0;

        // if this is a string the user has just requested a validation by name, such as `isRequired`. Otherwise, user
        // has provided a validation config, so use that.
        validationConfig = typeof v === 'string' ? { [v]: {} } : v;

        const result = validate(inputValue, validationConfig, formData);

        setIsValid(!result);
        if (result) {
          const [unmetRuleKey, errorMessage] = result;
          setHelperText(errorMessage);
          updateError(name, unmetRuleKey, errorMessage);
          break; // stop on the first error - we only show one at a time.
        } else {
          updateError(name);
        }
      }
    },
    [name, validation, updateError]
  );

  // watch for external parent data changes in self
  useEffect(() => {
    if (value !== formValue) {
      setValue(formValue);
      setIsTouched(false);
    }
  }, [formValue, value]);

  // validate on value change
  useEffect(() => {
    if (isTouched) {
      handleValidation(value);
    } else {
      // if not touched, make sure the input is valid. This is needed when this effect is triggered due to a
      // programmatic update to the form data, otherwise inputs that should now be valid won't get updated.
      updateError(name);
    }
  }, [value, isTouched, handleValidation]);

  // rewrite self and parent's value
  const handleChange = (e: FormEvent<HTMLInputElement>) => {
    const { type, checked } = e.currentTarget;
    const inputValue = e.currentTarget.value;

    const newValue = type === 'checkbox' ? checked : inputValue;

    setValue(inputValue);
    setFormData({
      ...formData,
      [name]: newValue
    });
  };

  const handleBlur = () => {
    if (!isTouched) {
      setIsTouched(true);
    }
    handleValidation(value);
  };

  const showError = !isValid && isTouched;

  let helperTextObj: { [key: string]: string } | undefined = void 0;
  if (helperTextAttr && helperText !== undefined) {
    helperTextObj = {};
    helperTextObj[helperTextAttr] = helperText;
  }

  const inputAttr = {
    ...(showError && helperTextObj),
    ...(showError && invalidAttr),
    name,
    onBlur: handleBlur,
    onChange: handleChange,
    value
  };

  return inputAttr;
};

export const useForm = (
  formRef: RefObject<HTMLFormElement>,
  defaultValues: FormData,
  handleSubmit?: FormSubmitHandler,
  invalidAttr = ValidatorSettings.invalidAttr,
  helperTextAttr = ValidatorSettings.invalidHelperTextAttr
) => {
  const formHandler = useState(defaultValues);
  const errorHandler = useState<{ [key: string]: string }>({});
  const [mounted, setMounted] = useState(false);

  const [values, setValues] = formHandler;
  const [errors, setErrors] = errorHandler;

  // initial mounted flag
  useEffect(() => setMounted(true), []);

  const updateError = (
    name: string,
    unmetRule?: string,
    errorMessage?: string
  ) => {
    if (!unmetRule) {
      delete errors[name];
    } else {
      if (errorMessage !== undefined) {
        errors[name] = errorMessage;
      }
    }
    setErrors(errors);
  };

  if (formRef.current) {
    if (!formRef.current.formValidationIdAttr) {
      formRef.current.formValidationIdAttr = Math.random()
        .toString(36)
        .substr(2, 9);
    }
  }

  const formInputsAttrs = useRef<{
    [key: string]: { [key: string]: InputAttributes };
  }>({});

  const validateForm = () => {
    if (formRef.current) {
      const formInputsByName =
        formInputsAttrs.current[formRef.current.formValidationIdAttr];

      if (formInputsByName) {
        // trigger validation on each of the form's inputs
        Object.keys(formInputsByName).forEach(inputName =>
          formInputsByName[inputName].onBlur()
        );
      }
    }

    return mounted && !Object.values(errors).length; // no errors found
  };

  const useInput = (name: string, validationConfigs: InputValidation[]) => {
    const inputAttr = useFormInput({
      formHandler,
      helperTextAttr,
      invalidAttr,
      name,
      updateError,
      validation: validationConfigs
    });

    if (formRef.current) {
      if (!formInputsAttrs.current[formRef.current.formValidationIdAttr]) {
        formInputsAttrs.current[formRef.current.formValidationIdAttr] = {};
      }
      formInputsAttrs.current[formRef.current.formValidationIdAttr][
        inputAttr.name
      ] = inputAttr;
    }

    return inputAttr;
  };

  const formSubmitHandler = (e: Event) => {
    // first validate the form
    if (validateForm()) {
      try {
        // since the form is valid, delegate to the user-provided submit handler, if one was given to us
        if (handleSubmit) {
          handleSubmit(e, values);
        } else {
          // by default, we don't submit the form. If the user wants the native submission behavior, they must
          // provide a submit handler.
          e.preventDefault();
          return false;
        }
      } catch (e) {
        throw new Error(
          'An error has happened executing the user-provided form submit handler.'
        );
      }
    } else {
      // there were errors, so prevent form submission in all cases
      e.preventDefault();
      return false;
    }

    return true;
  };

  // now find the form with the given ref, and attach our own onSubmit handler which will trigger the entire
  // form validation. If the entire form is found to be valid, it will also trigger the user-provided submit handler.
  if (formRef.current) {
    // we replace the handler so that the new function created during this render, which includes the updated form
    // values available to it through closure, can then be used if the user submits the form.
    if (formRef.current.currentSubmitHandler) {
      formRef.current.removeEventListener(
        'submit',
        formRef.current.currentSubmitHandler
      );
    }

    formRef.current.addEventListener('submit', formSubmitHandler);
    formRef.current.currentSubmitHandler = formSubmitHandler;
  }

  // we proxy this set state call so that we can trigger a form validation once a new set of values has been set on the form.
  const externalSetValues = (formValues: FormData) => {
    setValues(formValues);
    validateForm();
  };

  return {
    errors,
    formValues: values,
    isValid: mounted && !Object.values(errors).length,
    setValues: externalSetValues,
    useInput,
    validateForm
  };
};

const loadValidatorDependency = () => {
  validator = require('validator');

  if (validator !== undefined) {
    return true;
  }

  const validatorVersion: string | undefined = require('validator/package.json')
    .version;

  // check if we support the validator version - throw error if unsupported
  if (validatorVersion) {
    const versionParts = validatorVersion.split('.');
    if (parseInt(versionParts[0], 10) < 11) {
      // major version is 11 or higher
      validator = undefined;
      throw new Error(
        `Formalizer: unsupported version of the validator library found (${validatorVersion}). Please upgrade to 11.0.0 or higher.`
      );
    }
  }

  return validator !== undefined;
};

/**
 * Returns either unmet rule, or null
 * @param value
 * @param validation
 * @returns {*}
 */
export const validate = (
  value: any,
  validation: InputValidationByKey,
  formData: FormData
) => {
  const fieldsToValidate: Array<{
    key: string;
    validation: InputValidationConfig;
  }> = [];

  // making sure the given validator is of supported type
  if (
    validation === null ||
    validation === undefined ||
    (typeof validation !== 'string' && typeof validation !== 'object') ||
    Array.isArray(validation)
  ) {
    throw new Error('Formalizer: validators must be of string or object type.');
  }

  Object.keys(validation).forEach(property => {
    let options = { formData };
    let errorMsg: string = DEFAULT_VALIDATION_ERROR_MESSAGE;
    let negate: boolean | undefined = false;
    let validatorFunction: ValidatorFunction | undefined = void 0;

    if (GlobalValidators[property]) {
      // making sure the given validator is of supported type
      if (
        GlobalValidators[property] === null ||
        (typeof GlobalValidators[property] !== 'string' &&
          typeof GlobalValidators[property] !== 'object') ||
        Array.isArray(GlobalValidators[property])
      ) {
        throw new Error(
          'Formalizer: validators must be of string or object type.'
        );
      }

      if (typeof GlobalValidators[property] === 'string') {
        if (loadValidatorDependency()) {
          // @ts-ignore
          validatorFunction = validator[
            GlobalValidators[property] as string
          ] as ValidatorFunction;
        }
        errorMsg = GlobalValidators[property] as string;
        negate = false;
      } else {
        // can only be an object at this point
        const propValidator = GlobalValidators[
          property
        ] as InputValidationConfig;

        if (typeof propValidator.validator === 'string') {
          if (loadValidatorDependency()) {
            validatorFunction = validator[propValidator.validator];
          }
        } else if (typeof propValidator.validator === 'function') {
          validatorFunction = propValidator.validator;
        } else {
          throw new Error(
            'Formalizer: the given validator must be either a string or a function.'
          );
        }

        if (propValidator.errorMessage) {
          errorMsg = propValidator.errorMessage;
        }

        negate = propValidator.negate === void 0 ? false : propValidator.negate;
        options =
          propValidator.options === void 0
            ? { formData }
            : propValidator.options;
      }
    } else {
      const valConfig = validation[property] as
        | InputValidationConfig
        | undefined;

      if (
        valConfig === null ||
        valConfig === undefined ||
        Array.isArray(valConfig)
      ) {
        throw new Error(
          'Formalizer: validators must be of string or object type.'
        );
      }

      // if this is an empty object, user passed in just the string for a built in validator, which got converted to an
      // empty object before validate was invoked.
      if (Object.keys(valConfig as object).length === 0) {
        if (loadValidatorDependency()) {
          validatorFunction = (validator as any)[property];
        }
      } else if (
        typeof valConfig === 'object' &&
        typeof valConfig.validator === 'string'
      ) {
        if (loadValidatorDependency()) {
          validatorFunction = validator[valConfig.validator];
        }
      }
    }

    fieldsToValidate.push({
      key: property,
      validation: {
        errorMessage: errorMsg,
        negate,
        options,
        validator: validatorFunction
      }
    });

    if (typeof validation[property] === 'string') {
      fieldsToValidate[
        fieldsToValidate.length - 1
      ].validation.errorMessage = validation[property] as string;
    } else if (typeof validation[property] === 'object') {
      if (
        typeof (validation[property] as InputValidationConfig).validator ===
        'string'
      ) {
        // this was resolved to a validator function, we can discard the string now.
        delete (validation[property] as InputValidationConfig).validator;
      }

      fieldsToValidate[fieldsToValidate.length - 1].validation = {
        ...fieldsToValidate[fieldsToValidate.length - 1].validation,
        ...(validation[property] as object)
      };
    } else {
      throw new Error(
        'Formalizer: validators must be of string or object type.'
      );
    }
  });

  let unmetValidationKey: string | undefined = void 0;
  let errorMessage: string | undefined = void 0;
  let isValid = true;

  for (const validationConfig of fieldsToValidate) {
    const property = validationConfig.key;
    const configs: InputValidationConfig = validationConfig.validation;

    if (!configs.options) {
      configs.options = { formData };
    } else if (!configs.options.formData) {
      configs.options = { ...configs.options, formData };
    }

    switch (property) {
      case 'isRequired':
        if (!value || value.trim().length === 0) {
          isValid = false;
          unmetValidationKey = property;
          errorMessage = validationConfig.validation.errorMessage;
        }
        break;

      default:
        if (typeof configs.validator === 'function') {
          isValid = configs.validator(value, configs.options);
        } else if (typeof configs.validator === 'undefined') {
          throw new Error(
            `Formalizer: cannot find a validator named "${property}". If you are attempting to perform a validation defined ` +
              `by the Validator library, please make sure to have it installed prior.`
          );
        } else {
          throw new Error(
            `Formalizer: unable to execute the "${property}" validation. The given validator is not a function.`
          );
        }
    }

    if (configs.negate) {
      isValid = !isValid;
    }

    if (!isValid) {
      unmetValidationKey = property;
      errorMessage = validationConfig.validation.errorMessage;
      break;
    }
  }

  return isValid ? null : [unmetValidationKey, errorMessage];
};

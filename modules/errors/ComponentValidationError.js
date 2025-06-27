export class ComponentValidationError extends Error {
    constructor(message, propertyName, sourceObject) {
        super(message);
        this.propertyName = propertyName;
        this.sourceObject = sourceObject;
        this.name = this.constructor.name;
    }
}
export class RequiredFieldError extends ComponentValidationError {
    constructor(propertyName, sourceObject) {
        super(game.i18n.format('CSB.ComponentProperties.Errors.RequiredFieldError', { PROPERTY_NAME: propertyName }), propertyName, sourceObject);
        this.propertyName = propertyName;
        this.sourceObject = sourceObject;
    }
}
export class AlphanumericPatternError extends ComponentValidationError {
    constructor(propertyName, sourceObject) {
        super(game.i18n.format('CSB.ComponentProperties.Errors.AlphanumericPatternError', {
            PROPERTY_NAME: propertyName
        }), propertyName, sourceObject);
        this.propertyName = propertyName;
        this.sourceObject = sourceObject;
    }
}
export class NotUniqueError extends ComponentValidationError {
    constructor(propertyName, sourceObject) {
        super(game.i18n.format('CSB.ComponentProperties.Errors.NotUniqueError', { PROPERTY_NAME: propertyName }), propertyName, sourceObject);
        this.propertyName = propertyName;
        this.sourceObject = sourceObject;
    }
}
export class NotGreaterThanZeroError extends ComponentValidationError {
    constructor(propertyName, sourceObject) {
        super(game.i18n.format('CSB.ComponentProperties.Errors.NotGreaterThanZeroError', { PROPERTY_NAME: propertyName }), propertyName, sourceObject);
        this.propertyName = propertyName;
        this.sourceObject = sourceObject;
    }
}

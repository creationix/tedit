window.hasGenerators = (function*(){yield true;})().next().value;

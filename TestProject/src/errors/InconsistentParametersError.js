export default class InconsistentParametersError extends Error
{
    constructor(message)
    {
        super(message);
        this.name = "InconsistentParametersError";
    }
}

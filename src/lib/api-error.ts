export class ApiError extends Error{
 constructor(message:string,public code?:string,public actionUrl?:string){super(message);this.name='ApiError';}
}

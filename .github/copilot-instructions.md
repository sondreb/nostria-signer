This is an Angular 19 project, make sure to always use signals and effects. Also always use most modern TypeScript, with async/await.

Make sure to use new flow syntax of latest Angular, which is @if instead of *ngIf, @for instead of *ngFor, and @let instead of *ngLet.

Always use separate file for component (TypeScript), markup (HTML) and styles (CSS).

Make sure to put most styles in the global styles.css file, and only use component styles for component-specific styles.

Always use "fetch" for http request instead of HttpClient.

Don't use constructor for dependency injection, use inject instead.
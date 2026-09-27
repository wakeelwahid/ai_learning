import{e as i,r as m,j as s,ay as o}from"./index-SZVe2leL.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=i("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]),l={sm:"w-8 h-8 text-xs",md:"w-10 h-10 text-sm",lg:"w-12 h-12 text-base",xl:"w-16 h-16 text-lg"};function p({src:t,name:e,size:r="md",className:a}){const[n,c]=m.useState(!1),x=(e||"?").trim().charAt(0).toUpperCase();return t&&!n?s.jsx("img",{src:t,alt:e||"avatar",onError:()=>c(!0),className:o("rounded-full object-cover",l[r],a)}):s.jsx("div",{className:o("rounded-full flex items-center justify-center font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",l[r],a),children:x})}export{p as A,u as P};

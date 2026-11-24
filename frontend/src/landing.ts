// Signed-out page: Main.dc.html reference. Authentication stays in main.ts.
const icon=(paths:string)=>'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
const tiles=[
 ['English','sky',icon('<path d="M4 19L10 5l6 14M6.5 14h7"></path><path d="M18 19v-7"></path>')],
 ['Urdu','butter','<span class="landing-urdu" lang="ur" dir="rtl">اردو</span>'],
 ['Numbers','mint',icon('<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"></path>')],
 ['Words','peach',icon('<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M7 10h10M7 14h6"></path>')],
 ['Stories','sky',icon('<path d="M12 6c-2-2-5-2.5-8-2v14c3-.5 6 0 8 2 2-2 5-2.5 8-2V4c-3-.5-6 0-8 2zM12 6v14"></path>')],
 ['Drawing','butter',icon('<path d="M4 20l1-4L16 5l3 3L8 19z"></path><path d="M14 7l3 3"></path>')],
 ['Animated animal friends','mint',icon('<path d="M5 4l5 4h4l5-4v8c0 4-3.5 8-7 8s-7-4-7-8z"></path><circle cx="9.5" cy="12.5" r=".6" fill="currentColor"></circle><circle cx="14.5" cy="12.5" r=".6" fill="currentColor"></circle>')]
];
export function landingPage(){
 return `<div class="lga-landing">
 <header class="landing-header">
 <a class="landing-brand" href="#top"><svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="#205B46"></rect><path d="M8 9l7 5h6l7-5v10c0 5-4.5 9-10 9S8 24 8 19z" fill="#F2B84B"></path><circle cx="14.5" cy="20" r="1.6" fill="#203245"></circle><circle cx="21.5" cy="20" r="1.6" fill="#203245"></circle></svg><span>Little Genius Adventure</span></a>
 <a class="landing-link" href="#school-portal" data-landing-signin>School Portal</a>
 </header>
 <main id="top" class="landing-main">
 <section class="landing-hero" aria-labelledby="hero-title">
 <div class="landing-intro"><h1 id="hero-title">Little steps. Big discoveries.</h1><p>Explore preschool learning adventures with English, Urdu, numbers, words, stories, drawing and animated animal friends.</p></div>
 <div class="landing-demo"><div><h2>Explore with one free demo</h2><p>Sign in with a verified email to start your one-time 15-minute preview.</p></div>
 <div><button id="licence-signin" class="landing-button" type="button">Sign In to Explore</button></div>
 <p class="landing-privacy">This site counts visits using a browser identifier. If you sign in, your verified email and sign-in dates are visible to the app owner for school licensing enquiries.</p>
 <p id="licence-message" role="status" aria-live="polite"></p>
 </div></section>
 <section class="landing-explore" aria-labelledby="explore-title"><h2 id="explore-title">What children explore</h2><ul>${tiles.map(([name,tint,art])=>`<li class="landing-tile landing-${tint}">${art}<span>${name}</span></li>`).join('')}</ul></section>
 <section class="landing-cta" aria-labelledby="cta-title"><div><h2 id="cta-title">Try one free 15-minute preview</h2><p>Sign in with a verified email to begin.</p></div><button class="landing-button landing-button-light" type="button" data-landing-signin>Sign In to Explore</button></section>
 </main>
 <footer class="landing-footer">Annual school licences · Publisher retains application ownership and source code.</footer></div>`;
}

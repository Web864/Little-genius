// Original, scalable FULL-BODY animal artwork for the preschool game.
// All SVGs have a visible head, torso, paws/feet, and species-specific features.
const all=['Bunny','Foxy','Bear','Owl','Panda','Deer','Squirrel','Butterfly'];
const tones={
 Bunny:['#F9F6F0','#9A8187','#F5B8C5','#FFFDFC'],
 Foxy:['#EA894C','#8C584C','#F7B99D','#FFF0D9'],
 Bear:['#B88A67','#775E4B','#E9B5A2','#F3DDBF'],
 Owl:['#AB8A73','#756050','#F0C5A2','#F3E2C3'],
 Panda:['#F9F9F5','#353942','#F4C1B8','#FFFFFF'],
 Deer:['#C99A6D','#825E49','#EFBCA6','#FFF0D9'],
 Squirrel:['#D59059','#875744','#F0B8A3','#FFE3C0'],
 Butterfly:['#A68BDC','#6550A0','#F5B5D4','#DCD2FF']
};
const circle=(x,y,r,fill)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'"/>';
const ellipse=(x,y,rx,ry,fill,extra='')=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+fill+'" '+extra+'/>';
const path=(d,fill,stroke='',width=0)=>'<path d="'+d+'" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round"':'')+'/>';
function art(name){
 const c=tones[name]||tones.Foxy,[fur,edge,blush,light]=c;
 const outlined=(x,y,rx,ry,color)=>ellipse(x,y,rx,ry,color,'stroke="'+edge+'" stroke-width="3"');
 const eye=ellipse(90,90,5,7,'#2E3645')+ellipse(130,90,5,7,'#2E3645')+circle(89,88,1.5,'#fff')+circle(129,88,1.5,'#fff');
 const face=eye+circle(78,107,8,blush)+circle(142,107,8,blush)+path('M104 111 Q110 118 116 111','#604A4A')+path('M99 121 Q110 132 121 121','none','#604A4A',3);
 const muzzle=ellipse(110,112,25,18,light)+face;
 const feet=outlined(85,215,26,13,edge)+outlined(135,215,26,13,edge);
 const torso=outlined(110,166,53,57,fur)+ellipse(110,171,30,37,light);
 const arms=outlined(60,161,16,31,fur)+outlined(160,161,16,31,fur);
 const head=outlined(110,88,58,49,fur);
 const outer=feet+torso+arms;
 if(name==='Bunny'){
  return ellipse(83,39,18,48,fur,'transform="rotate(-13 83 39)" stroke="'+edge+'" stroke-width="3"')+
   ellipse(137,39,18,48,fur,'transform="rotate(13 137 39)" stroke="'+edge+'" stroke-width="3"')+
   ellipse(83,39,9,32,blush,'transform="rotate(-13 83 39)"')+
   ellipse(137,39,9,32,blush,'transform="rotate(13 137 39)"')+
   circle(170,182,18,light)+outer+head+muzzle+
   path('M77 119 L55 113 M77 127 L55 132 M143 119 L166 113 M143 127 L166 132','none',edge,2);
 }
 if(name==='Foxy'){
  return path('M145 183 Q202 217 196 154 Q184 125 174 146 Q171 168 148 158Z',fur,edge,3)+
   path('M187 155 Q202 160 189 180 L173 177Z',light)+
   path('M61 72 L67 18 L101 56 M159 72 L153 18 L119 56',fur,edge,4)+
   path('M67 51 L72 32 L89 56 M153 51 L148 32 L131 56',light)+outer+
   path('M58 79 Q64 42 110 44 Q156 42 162 79 Q174 116 130 133 L110 139 L90 133 Q46 116 58 79Z',fur,edge,3)+
   path('M59 101 L110 138 L161 101 Q150 129 110 138 Q70 129 59 101Z',light)+face;
 }
 if(name==='Bear'){
  return circle(66,54,24,fur)+circle(154,54,24,fur)+circle(66,54,12,blush)+circle(154,54,12,blush)+
   outer+outlined(110,91,62,54,fur)+muzzle;
 }
 if(name==='Owl'){
  return feet+torso+
   path('M65 129 Q22 141 40 190 Q72 184 88 151Z',fur,edge,3)+
   path('M155 129 Q198 141 180 190 Q148 184 132 151Z',fur,edge,3)+
   path('M74 55 L61 34 L64 87 M146 55 L159 34 L156 87',fur,edge,3)+head+
   ellipse(89,90,27,30,light)+ellipse(131,90,27,30,light)+eye+
   path('M101 110 L119 110 L110 127Z','#D69754')+path('M98 126 Q110 134 122 126','none',edge,3);
 }
 if(name==='Panda'){
  return circle(64,50,23,edge)+circle(156,50,23,edge)+
   outlined(84,215,27,14,edge)+outlined(136,215,27,14,edge)+
   torso+outlined(60,159,18,33,edge)+outlined(160,159,18,33,edge)+head+
   ellipse(87,90,17,24,edge,'transform="rotate(18 87 90)"')+
   ellipse(133,90,17,24,edge,'transform="rotate(-18 133 90)"')+
   circle(91,89,6,light)+circle(129,89,6,light)+muzzle;
 }
 if(name==='Deer'){
  return path('M76 53 Q52 30 50 10 M61 30 L68 9 M144 53 Q168 30 170 10 M159 30 L152 9','none',edge,8)+
   ellipse(66,61,26,14,fur,'transform="rotate(25 66 61)"')+
   ellipse(154,61,26,14,fur,'transform="rotate(-25 154 61)"')+
   outer+head+muzzle+ellipse(110,110,9,7,edge);
 }
 if(name==='Squirrel'){
  return path('M151 183 Q207 214 202 154 Q190 114 166 128 Q164 148 180 151 Q186 163 154 163Z',fur,edge,4)+
   path('M188 139 Q200 153 189 167','none',light,7)+
   circle(69,55,21,fur)+circle(151,55,21,fur)+outer+head+muzzle;
 }
 return path('M110 119 Q42 36 21 75 Q-1 121 71 146 Q12 157 38 211 Q79 230 110 156Z',blush,edge,4)+
 path('M110 119 Q178 36 199 75 Q221 121 149 146 Q208 157 182 211 Q141 230 110 156Z',light,edge,4)+
 circle(58,106,17,'#FFFFFF88')+circle(162,106,17,'#FFFFFF88')+
 path('M105 73 Q83 42 93 25 M115 73 Q137 42 127 25','none',edge,4)+circle(93,25,5,fur)+circle(127,25,5,fur)+
 ellipse(110,156,15,63,fur)+circle(110,85,30,fur)+
 ellipse(98,83,4,6,'#2E3645')+ellipse(122,83,4,6,'#2E3645')+
 path('M101 99 Q110 107 119 99','none',edge,3)+
 path('M106 207 L94 221 M114 207 L126 221','none',edge,4);
}
export function fullAnimal(name,celebrate=false){
 const friend=all.includes(name)?name:'Foxy';
 return '<span class="lg-animal lg-animal--'+friend.toLowerCase()+' '+(celebrate?'lg-animal--celebrate':'')+'" data-animal="'+friend+'">'+
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240" aria-hidden="true" focusable="false">'+
 ellipse(110,229,62,9,'#253D4130')+'<g class="lg-animal-figure">'+art(friend)+'</g></svg></span>';
}

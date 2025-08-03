import { Network } from '../src/index.js';

// 🎯 Minimal GitHub API Demo - Network Unit in Action

async function demo() {
  console.log('🚀 Network Unit Demo - GitHub Repository Data\n');
  
  // One line to rule them all
  const network = Network.create();
  
  try {
    // Real GitHub API call with automatic circuit protection
    const result = await network.request('https://api.github.com/repos/synthetism/network');
    
    // Access the parsed JSON data
    const repo = result.parsed as any;
    
    console.log('📊 Repository Data:');
    console.log(`• Name: ${repo.name}`);
    console.log(`• Description: ${repo.description || 'No description'}`);
    console.log(`• Stars: ${repo.stargazers_count}`);
    console.log(`• Language: ${repo.language || 'Unknown'}`);
    console.log(`• Created: ${new Date(repo.created_at).toLocaleDateString()}`);
    console.log(`• Updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
    
    console.log('\n🧠 Network Intelligence:');
    console.log(network.getStats());
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    console.log('\n🔧 Circuit Protection Active:');
    console.log(network.getCircuitStats());
  }
}

// Run the demo
demo().catch(console.error);

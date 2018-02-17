<template>
  <Squares/>
</template>

<script>
import Squares from './components/Squares'

export default {
  name: 'App',
  components: {
    Squares
  }
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
